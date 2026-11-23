export const COLLECTIONS = [
  {id:'juntas',title:'Juntas desde siempre',subtitle:'Dos hermanas, mil historias',icon:'♡'},
  {id:'emiliana',title:'El mundo de Emiliana',subtitle:'Pequeños pasos, grandes logros · 5.º',icon:'✦'},
  {id:'alejandra',title:'El camino de Alejandra',subtitle:'Una etapa inolvidable · 11.º',icon:'✧'},
  {id:'familia',title:'Recuerdos en familia',subtitle:'Momentos que hacen nuestra historia',icon:'❀'}
] as const;
export type AlbumId = typeof COLLECTIONS[number]['id'];
export type TrackId = 'general'|'especial';
export type RSVP = 'pendiente'|'confirmada'|'no_asistira';
export interface Photo { id:string; url:string; caption:string; }
export type Galleries = Record<AlbumId,Photo[]>;
export interface EventData {
  id:string;
  owner_id?:string;
  title:string;
  message:string;
  date:string;
  venue:string;
  address:string;
  arrival_note:string;
  maps_url:string;
  rsvp_deadline:string;
  galleries:Galleries;
  music_general_url:string;
  music_general_start:number;
  music_special_url:string;
  music_special_start:number;
  closing:string;
}
export interface Group {id:string;event_id:string;name:string;track:TrackId;default_seats:number;}
export interface Guest {
  id:string;event_id:string;group_id:string|null;name:string;seats:number;show_seats:boolean;phone:string;
  share_token:string;sent:boolean;sent_at:string|null;status:RSVP;
  attending_count:number;message:string;created_at:string;
}
export interface Dashboard {event:EventData;groups:Group[];guests:Guest[]}
export interface PublicInvite {event:EventData;guest:Guest;group_name:string;track:TrackId;}
export const gid=()=>crypto.randomUUID();
export const token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
export const DEFAULT_EVENT:EventData={
  id:'local-event',title:'Dos sueños, una celebración',
  message:'De la mano de quienes nos han acompañado, celebramos dos metas que marcan nuevos comienzos.',
  date:'2026-12-05T20:00:00-05:00',venue:'Salón de eventos del edificio residencial',address:'Calle 66 #50-50',
  arrival_note:'Te esperamos puntualmente a las 8:00 p. m. El salón de eventos se encuentra en un edificio residencial y tiene un horario de cierre que debemos respetar. ¡Gracias por ayudarnos a disfrutar cada momento juntos!',maps_url:'',rsvp_deadline:'',
  galleries:{juntas:[],emiliana:[],alejandra:[],familia:[]},
  music_general_url:'',music_general_start:0,music_special_url:'',music_special_start:0,
  closing:'Nos hará muy felices compartir este día contigo.'
};
export const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
export function getTrack(guest:Guest,groups:Group[]):TrackId {
  return groups.find(g=>g.id===guest.group_id)?.track ?? 'general';
}
export function dateLabel(input:string):string {
  if(!input)return 'Fecha por confirmar';
  const d=new Date(input);
  if(isNaN(d.getTime()))return 'Fecha por confirmar';
  return new Intl.DateTimeFormat('es-CO',{dateStyle:'full',timeStyle:'short',timeZone:'America/Bogota'}).format(d);
}
export function countdown(input:string){
  if(!input)return null;
  const v=new Date(input).getTime()-Date.now();
  if(!Number.isFinite(v))return null;
  const t=Math.max(0,Math.floor(v/1000));
  return {days:Math.floor(t/86400),hours:Math.floor(t/3600)%24,minutes:Math.floor(t/60)%60,seconds:t%60,past:v<=0};
}