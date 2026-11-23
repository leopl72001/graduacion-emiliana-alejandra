import {createClient, type SupabaseClient, type User} from '@supabase/supabase-js';
import {DEFAULT_EVENT,clone,gid,token,getTrack,type Dashboard,type EventData,type Group,type Guest,type Photo,type PublicInvite,type TrackId, type RSVP} from './model';

const u=import.meta.env.VITE_SUPABASE_URL||'https://twelrytvfftguzybtpol.supabase.co';
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||import.meta.env.VITE_SUPABASE_ANON_KEY||'sb_publishable_DyUH77-ur3ovXX2aljYUkg_C-3k7_Mf';
export const cloudEnabled=Boolean(u&&key&&u.startsWith('https://')&&!u.includes('TU-PROYECTO'));
export const supabase:SupabaseClient|null=cloudEnabled?createClient(u,key,{auth:{persistSession:true,autoRefreshToken:true}}):null;
const LOCAL_KEY='emiliana-alejandra-demo-v1';
/** One canonical shared event; using this ID prevents creating separate invitation lists. */
export const SHARED_EVENT_ID='0c4ed031-16e9-44b6-a0ec-30721a9eeccf';
export const settingsLink=()=>`${location.origin}${import.meta.env.BASE_URL}#/settings`;

export function localData():Dashboard{
  try {const value=localStorage.getItem(LOCAL_KEY);if(value){const obj=JSON.parse(value) as Dashboard;return obj;}}catch{/* no local storage */}
  return {event:clone(DEFAULT_EVENT),groups:[
    {id:'local-familia',event_id:'local-event',name:'Familia',track:'general',default_seats:3},
    {id:'local-amigos',event_id:'local-event',name:'Amigos',track:'especial',default_seats:2}
  ],guests:[]};
}
function saveLocal(d:Dashboard){localStorage.setItem(LOCAL_KEY,JSON.stringify(d));}
let sessionUser:User|null=null;
async function user(){
  if(!supabase)return null;
  if(sessionUser)return sessionUser;
  const {data,error}=await supabase.auth.getUser();
  if(!error&&data.user){sessionUser=data.user;return sessionUser;}
  const signIn=await supabase.auth.signInAnonymously();
  if(signIn.error||!signIn.data.user)throw new Error('Activa Anonymous Sign-Ins en Supabase: Authentication → Sign In / Providers → Anonymous.');
  sessionUser=signIn.data.user;return sessionUser;
}
function check(error:{message:string}|null){if(error)throw new Error(error.message);}
export async function loadDashboard():Promise<Dashboard>{
  if(!supabase)return clone(localData());
  const owner=await user();if(!owner)throw new Error('No se pudo iniciar sesión de administración.');
  // Supabase RLS returns the same canonical event for its owner and paired devices.
  // Never auto-create an empty event in a new browser.
  const get=await supabase.from('sisters_events').select('*').eq('id',SHARED_EVENT_ID).maybeSingle();check(get.error);
  if(!get.data)throw new Error('UNPAIRED_DEVICE');
  const event=get.data as EventData;
  const [gg,gr]=await Promise.all([
    supabase.from('sisters_groups').select('*').eq('event_id',event.id).order('name'),
    supabase.from('sisters_guests').select('*').eq('event_id',event.id).order('created_at',{ascending:false})
  ]);
  check(gg.error);check(gr.error);
  return {event,groups:(gg.data||[]) as Group[],guests:(gr.data||[]) as Guest[]};
}

/** Pairing is intentionally a short-lived, one-use edit credential. Keep it private. */
export async function issuePairingLink():Promise<string>{
  if(!supabase)throw new Error('Se necesita Supabase para sincronizar.');
  await user();
  const r=await supabase.rpc('sisters_issue_pairing');
  check(r.error);
  if(typeof r.data!=='string'||!/^[0-9a-f]{64}$/i.test(r.data))throw new Error('No se pudo crear el enlace temporal.');
  return settingsLink()+'?pair='+r.data;
}
export async function claimPairingLink(value:string):Promise<void>{
  if(!supabase)throw new Error('Se necesita Supabase para vincular.');
  await user();
  const code=value.trim().match(/(?:pair=)?([0-9a-f]{64})/i)?.[1];
  if(!code)throw new Error('Pega el código completo o el enlace de vinculación.');
  const r=await supabase.rpc('sisters_claim_pairing',{p_code:code});
  check(r.error);
  if(r.data!==SHARED_EVENT_ID)throw new Error('El dispositivo no está conectado al evento correcto.');
}
export interface LinkedDevice {user_id:string;created_at:string;}
export async function getLinkedDevices():Promise<LinkedDevice[]>{
  if(!supabase)return[];
  await user();
  const r=await supabase.rpc('sisters_list_editors');check(r.error);
  return (Array.isArray(r.data)?r.data:[]) as LinkedDevice[];
}
export async function disconnectDevice(userId:string):Promise<void>{
  if(!supabase)throw new Error('No hay conexión con la nube.');
  await user();
  const r=await supabase.rpc('sisters_remove_editor',{p_user_id:userId});
  check(r.error);
}
export async function currentAdminId():Promise<string>{
  if(!supabase)return 'demo';
  return (await user())?.id||'';
}

export async function writeEvent(event:EventData,previous:Dashboard){
  if(!supabase){saveLocal({...previous,event});return;}
  const {id,...patch}=event;
  const r=await supabase.from('sisters_events').update(patch).eq('id',id);check(r.error);
}
export async function writeGroup(group:Group,previous:Dashboard){
  if(!supabase){saveLocal({...previous,groups:[group,...previous.groups.filter(x=>x.id!==group.id)]});return;}
  const owner=await user();if(!owner)throw new Error('Inicia sesión en Supabase.');
  const r=await supabase.from('sisters_groups').upsert({...group,owner_id:previous.event.owner_id||owner.id});check(r.error);
}
export async function deleteGroup(id:string,previous:Dashboard){
  if(!supabase){saveLocal({...previous,groups:previous.groups.filter(g=>g.id!==id),guests:previous.guests.map(g=>g.group_id===id?{...g,group_id:null}:g)});return;}
  const r=await supabase.from('sisters_groups').delete().eq('id',id);check(r.error);
}
export async function writeGuest(guest:Guest,previous:Dashboard){
  if(!supabase){saveLocal({...previous,guests:[guest,...previous.guests.filter(x=>x.id!==guest.id)]});return;}
  const owner=await user();if(!owner)throw new Error('Inicia sesión en Supabase.');
  const r=await supabase.from('sisters_guests').upsert({...guest,owner_id:previous.event.owner_id||owner.id});check(r.error);
}
export async function deleteGuest(id:string,previous:Dashboard){
  if(!supabase){saveLocal({...previous,guests:previous.guests.filter(g=>g.id!==id)});return;}
  const r=await supabase.from('sisters_guests').delete().eq('id',id);check(r.error);
}
export async function setSent(guest:Guest,sent:boolean,previous:Dashboard){
  const patch={sent,sent_at:sent?new Date().toISOString():null};
  if(!supabase){saveLocal({...previous,guests:previous.guests.map(x=>x.id===guest.id?{...x,...patch}:x)});return;}
  const r=await supabase.from('sisters_guests').update(patch).eq('id',guest.id);check(r.error);
}
export async function publicInvitation(shareToken:string):Promise<PublicInvite|null>{
  if(!supabase){const d=localData();const guest=d.guests.find(g=>g.share_token===shareToken);if(!guest)return null;const group=d.groups.find(x=>x.id===guest.group_id);return {event:d.event,guest,group_name:group?.name||'',track:getTrack(guest,d.groups)};}
  const r=await supabase.rpc('sisters_get_invite',{p_token:shareToken});check(r.error);
  return r.data as PublicInvite|null;
}
export async function sendRSVP(shareToken:string,status:RSVP,count:number,message:string):Promise<void>{
  if(!supabase){const d=localData();d.guests=d.guests.map(g=>g.share_token===shareToken?{...g,status,attending_count:status==='confirmada'?count:0,message}:g);saveLocal(d);return;}
  const r=await supabase.rpc('sisters_reply_invite',{p_token:shareToken,p_status:status,p_count:count,p_message:message});check(r.error);
}
export async function upload(file:File,eventId:string):Promise<string>{
  if(!supabase)throw new Error('Para subir fotos y música necesitas conectar Supabase. En la demo puedes pegar enlaces de archivos públicos.');
  const owner=await user();if(!owner)throw new Error('No se encontró la sesión de subida.');
  const audio=file.type.startsWith('audio/');const img=file.type.startsWith('image/');
  if(!audio&&!img)throw new Error('Se permiten imágenes JPG, PNG, WEBP y audio MP3, M4A, OGG o WAV.');
  if(file.size>(audio?16:10)*1024*1024)throw new Error('El archivo supera el tamaño permitido.');
  const ext=(file.name.split('.').pop()|| (audio?'mp3':'jpg')).toLowerCase().replace(/[^a-z0-9]/g,'');
  const path=`${owner.id}/${eventId}/${gid()}.${ext}`;
  const r=await supabase.storage.from('sisters-assets').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});check(r.error);
  return supabase.storage.from('sisters-assets').getPublicUrl(path).data.publicUrl;
}
export function newGuest(eventId:string,groupId:string|null=null):Guest{
  return {id:gid(),event_id:eventId,group_id:groupId,name:'',seats:1,show_seats:false,phone:'',share_token:token(),sent:false,sent_at:null,status:'pendiente',attending_count:0,message:'',created_at:new Date().toISOString()};
}
export function newGroup(eventId:string):Group{return {id:gid(),event_id:eventId,name:'',track:'general',default_seats:2}}
export function linkFor(guest:Guest){return `${location.origin}${import.meta.env.BASE_URL}#/invitacion/${guest.share_token}`}
export function whatsappFor(guest:Guest){
  const guestLine=guest.show_seats
    ? `Esta invitación es personal e incluye ${guest.seats} ${guest.seats===1?'cupo':'cupos'}.`
    : 'Esta invitación es personal y fue preparada especialmente para ti.';
  const text=`🎓 ¡Tienes una invitación especial, ${guest.name}!\n\nEmiliana se gradúa de 5.º y Alejandra de 11.º. Queremos compartir contigo este día tan especial.\n\n${guestLine}\n\n💙 Abre tu invitación aquí:\n${linkFor(guest)}`;
  return `https://wa.me/${guest.phone.replace(/\D/g,'')}?text=${encodeURIComponent(text)}`.replace('https://wa.me/?','https://wa.me/?');
}
export function pushPhoto(d:Dashboard,albumId:keyof EventData['galleries'],item:Photo):Dashboard{
  return {...d,event:{...d.event,galleries:{...d.event.galleries,[albumId]:[...d.event.galleries[albumId],item]}}};
}
export function checkLink(value:string):boolean{try{const url=new URL(value);return url.protocol==='https:' || url.protocol==='http:'}catch{return false}}
export function trackUrl(event:EventData,track:TrackId){return track==='especial'?event.music_special_url:event.music_general_url}
export function trackStart(event:EventData,track:TrackId){return track==='especial'?event.music_special_start:event.music_general_start}