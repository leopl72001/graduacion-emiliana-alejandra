import {useCallback,useEffect,useRef,useState,type CSSProperties,type FormEvent,type ReactNode} from 'react';
import {
  ArrowDown,ArrowLeft,ArrowRight,CalendarDays,Camera,Check,CheckCheck,
  CheckCircle2,ChevronRight,Clock3,Copy,Download,Edit3,ExternalLink,GraduationCap,
  Heart,ImagePlus,LayoutDashboard,Link2,Loader2,MapPin,Menu,MessageCircle,Music2,
  Pause,Play,Plus,Save,Search,Send,ShieldCheck,Sparkles,Trash2,UploadCloud,
  UserRound,Users,Volume2,VolumeX,X
} from 'lucide-react';
import {
  COLLECTIONS,clone,countdown,dateLabel,DEFAULT_EVENT,gid,getTrack,type AlbumId,type Dashboard,
  type EventData,type Group,type Guest,type Photo,type PublicInvite,type TrackId,type RSVP
} from './model';
import {
  cloudEnabled,deleteGroup,deleteGuest,linkFor,loadDashboard,newGroup,newGuest,
  publicInvitation,sendRSVP,setSent,upload,whatsappFor,writeEvent,writeGroup,writeGuest,checkLink
} from './store';

const TABS=[
  {id:'resumen',label:'Resumen',Icon:LayoutDashboard},
  {id:'invitaciones',label:'Invitaciones',Icon:Send},
  {id:'grupos',label:'Grupos y música',Icon:Users},
  {id:'galerias',label:'Galerías de fotos',Icon:Camera},
  {id:'musica',label:'Música',Icon:Music2},
  {id:'evento',label:'El gran día',Icon:CalendarDays},
  {id:'confirmaciones',label:'Confirmaciones',Icon:CheckCheck}
] as const;
type Tab=typeof TABS[number]['id'];
function formatCount(v:number){return String(v).padStart(2,'0')}
function localInputDate(value:string){return value?`${value.slice(0,10)}T${value.slice(11,16)}`:''}
function isoColombia(value:string){return value?`${value}:00-05:00`:''}
function shorten(value:string,max=38){return value.length>max?`${value.slice(0,max)}…`:value}
function compactDate(value:string){if(!value)return 'Pendiente';try{return new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeZone:'America/Bogota'}).format(new Date(value))}catch{return 'Pendiente'}}
async function copyLink(text:string){try{await navigator.clipboard.writeText(text)}catch{window.prompt('Copia este enlace:',text)}}
function Pill({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'blue'|'green'|'gold'}){return <span className={`pill pill-${tone}`}>{children}</span>}
function Card({children,className=''}:{children:ReactNode;className?:string}){return <section className={`panel-card ${className}`}>{children}</section>}
function Heading({eyebrow,title,desc,action}:{eyebrow:string;title:string;desc:string;action?:ReactNode}){return <div className="view-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{desc}</p></div>{action&&<div>{action}</div>}</div>}
function Empty({icon,heading,desc,action}:{icon:ReactNode;heading:string;desc:string;action?:ReactNode}){return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{heading}</h3><p>{desc}</p>{action}</div>}
function Starfield({count=25}:{count?:number}){return <div className="stars-bg" aria-hidden="true">{Array.from({length:count},(_,i)=><i key={i} style={{'--x':`${(i*43+9)%100}%`,'--y':`${(i*29+19)%100}%`,'--delay':`${-(i%7)*1.2}s`,'--size':`${(i%3)+2}px`} as CSSProperties}/>)}</div>}
function StatusPill({status}:{status:RSVP}){return <Pill tone={status==='confirmada'?'green':status==='no_asistira'?'gold':'neutral'}>{status==='confirmada'?'Confirmada':status==='no_asistira'?'No asistirá':'Sin responder'}</Pill>}

function DashboardAdmin(){
  const [data,setData]=useState<Dashboard|null>(null);
  const [loading,setLoading]=useState(true);
  const [failure,setFailure]=useState('');
  const [tab,setTab]=useState<Tab>('resumen');
  const [notice,setNotice]=useState('');
  const [working,setWorking]=useState(false);
  const [guestEdit,setGuestEdit]=useState<Guest|null>(null);
  const [groupEdit,setGroupEdit]=useState<Group|null>(null);
  const [preview,setPreview]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('todos');
  const [draftEvent,setDraftEvent]=useState<EventData>(clone(DEFAULT_EVENT));
  const [uploadBusy,setUploadBusy]=useState('');
  const [previewAudio,setPreviewAudio]=useState<TrackId|null>(null);
  const previewRef=useRef<HTMLAudioElement|null>(null);

  const refresh=useCallback(async()=>{
    try{const d=await loadDashboard();setData(d);setDraftEvent(clone(d.event));setFailure('');}
    catch(e){setFailure((e as Error).message)}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void refresh()},[refresh]);
  const notify=(message:string)=>{setNotice(message);window.setTimeout(()=>setNotice(''),3500)};
  const perform=async(job:()=>Promise<void>,success:string)=>{
    setWorking(true);
    try{await job();await refresh();notify(success);return true}
    catch(e){notify(`Error: ${(e as Error).message}`);return false}
    finally{setWorking(false)}
  };
  const saveEvent=async(value=draftEvent,success='Cambios guardados')=>{
    if(!data)return false;
    const ok=await perform(()=>writeEvent(value,data),success);
    if(ok)setDraftEvent(clone(value));
    return ok;
  };
  const saveGuest=async(value:Guest)=>{
    if(!data)return;
    if(!value.name.trim()){notify('Escribe el nombre del invitado.');return}
    const ok=await perform(()=>writeGuest(value,data),'Invitación guardada');
    if(ok)setGuestEdit(null);
  };
  const saveGroup=async(value:Group)=>{
    if(!data)return;
    if(!value.name.trim()){notify('El grupo necesita un nombre.');return}
    const ok=await perform(()=>writeGroup(value,data),'Grupo guardado');
    if(ok)setGroupEdit(null);
  };
  const toggleSent=async(guest:Guest)=>{
    if(!data)return;
    await perform(()=>setSent(guest,!guest.sent,data),guest.sent?'Marcada como no enviada':'Invitación marcada como enviada');
  };
  const fileUpload=async(files:FileList|null,album:AlbumId)=>{
    if(!data||!files?.length)return;
    let next=clone(data.event);
    setUploadBusy(album);
    try{
      for(const file of Array.from(files)){
        if(!file.type.startsWith('image/'))throw new Error('En galerías se admiten archivos de imagen.');
        const url=await upload(file,data.event.id);
        next.galleries[album]=[...next.galleries[album],{id:gid(),url,caption:''}];
      }
      const ok=await saveEvent(next,`${files.length} foto(s) subida(s)`);
      if(!ok)setDraftEvent(clone(data.event));
    }catch(e){notify(`Error al subir: ${(e as Error).message}`)}
    finally{setUploadBusy('')}
  };
  const removePhoto=async(album:AlbumId,id:string)=>{
    if(!data)return;
    const next=clone(data.event);next.galleries[album]=next.galleries[album].filter(p=>p.id!==id);
    await saveEvent(next,'Foto retirada de la galería');
  };
  const movePhoto=async(album:AlbumId,id:string,direction:-1|1)=>{
    if(!data)return;
    const next=clone(data.event),photos=next.galleries[album],index=photos.findIndex(p=>p.id===id),newIndex=index+direction;
    if(index<0||newIndex<0||newIndex>=photos.length)return;
    [photos[index],photos[newIndex]]=[photos[newIndex],photos[index]];
    await saveEvent(next,'Orden de las fotos actualizado');
  };
  const addPhotoUrl=async(album:AlbumId)=>{
    if(!data)return;const url=window.prompt('Pega un enlace directo y público a la fotografía:');if(!url)return;
    if(!checkLink(url)){notify('El enlace debe empezar con https://');return}
    const next=clone(data.event);next.galleries[album]=[...next.galleries[album],{id:gid(),url,caption:''}];
    await saveEvent(next,'Fotografía agregada');
  };
  const uploadMusic=async(file:File|undefined,track:TrackId)=>{
    if(!file||!data)return;
    setUploadBusy(`music-${track}`);
    try{
      const url=await upload(file,data.event.id);
      const next={...draftEvent,[track==='general'?'music_general_url':'music_special_url']:url};
      await saveEvent(next,'Canción subida y guardada');
    }catch(e){notify(`Error al subir canción: ${(e as Error).message}`)}
    finally{setUploadBusy('')}
  };
  const changePreview=(track:TrackId)=>{
    if(previewAudio===track){previewRef.current?.pause();setPreviewAudio(null);return}
    setPreviewAudio(track);
  };
  useEffect(()=>{if(previewAudio&&previewRef.current){const a=previewRef.current;a.currentTime=previewAudio==='general'?draftEvent.music_general_start:draftEvent.music_special_start;void a.play().catch(()=>setPreviewAudio(null));}},[previewAudio,draftEvent.music_general_url,draftEvent.music_special_url]);
  const exportCSV=()=>{
    if(!data)return;
    const rows=[['Nombre','Grupo','Cupos','Teléfono','Enviada','Fecha de envío','Respuesta','Asistentes','Enlace'],...data.guests.map(g=>[g.name,data.groups.find(x=>x.id===g.group_id)?.name||'Sin grupo',String(g.seats),g.phone,g.sent?'Sí':'No',g.sent_at||'',g.status,String(g.attending_count),linkFor(g)])];
    const csv='\ufeff'+rows.map(r=>r.map(x=>`"${/^[=+@\-\t\r]/.test(x)?"'":''}${x.replaceAll('"','""')}"`).join(';')).join('\r\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='invitados-emiliana-alejandra.csv';a.click();URL.revokeObjectURL(a.href);
  };
  if(loading)return <div className="loading-screen"><Loader2 className="spin" size={38}/><h2>Preparando nuestro estudio de invitaciones…</h2></div>;
  if(!data)return <div className="loading-screen"><ShieldCheck size={44}/><h2>No pudimos conectar el panel</h2><p>{failure||'Revisa tu configuración de Supabase.'}</p><button className="btn primary" onClick={()=>{setLoading(true);void refresh()}}>Reintentar</button><p><small>Si estás usando Supabase: activa Anonymous Sign-Ins y ejecuta supabase/schema.sql.</small></p></div>;
  if(preview)return <PublicInvitation data={{event:data.event,guest:{...newGuest(data.event.id),name:'Invitado de muestra',seats:2},group_name:'',track:'general'}} demo onBack={()=>setPreview(false)}/>;
  const guests=data.guests;
  const sent=guests.filter(g=>g.sent).length;
  const confirmed=guests.filter(g=>g.status==='confirmada').length;
  const waiting=guests.filter(g=>!g.sent).length;
  const quota=guests.reduce((n,g)=>n+g.seats,0);
  const filtered=guests.filter(g=>{
    const text=`${g.name} ${data.groups.find(x=>x.id===g.group_id)?.name||''}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (filter==='todos'||(filter==='no_enviadas'&&!g.sent)||(filter==='enviadas'&&g.sent)||(filter==='confirmadas'&&g.status==='confirmada'));
  });
  const openGuest=(groupId:string|null=null)=>setGuestEdit(newGuest(data.event.id,groupId));
  const panelMusic=(track:TrackId)=>{
    const main=track==='general',url=main?draftEvent.music_general_url:draftEvent.music_special_url;
    const start=main?draftEvent.music_general_start:draftEvent.music_special_start;
    return <Card className="music-panel" key={track}>
      <div className="music-head"><div className="music-art"><Music2 size={30}/><span>♪</span></div><div><Pill tone={main?'blue':'gold'}>{main?'PISTA 01':'PISTA 02'}</Pill><h3>{main?'Canción general':'Canción especial'}</h3><p>{main?'Invitados sin grupo y grupos configurados con pista general':'Grupos marcados con pista especial, por ejemplo Amigos'}</p></div></div>
      <label className="field"><span>Enlace directo al audio (MP3, M4A, OGG o WAV)</span><input placeholder="https://ejemplo.com/mi-cancion.mp3" value={url} onChange={e=>setDraftEvent(prev=>({...prev,[main?'music_general_url':'music_special_url']:e.target.value}))}/></label>
      <label className="upload-line"><UploadCloud size={18}/>{uploadBusy===`music-${track}`?'Subiendo música…':'Subir canción desde mi computador'}<input type="file" accept="audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/ogg,audio/wav,audio/x-wav,.mp3,.m4a,.ogg,.wav" disabled={Boolean(uploadBusy)} onChange={e=>void uploadMusic(e.target.files?.[0],track)}/></label>
      <div className="music-controls"><label className="field"><span>Desde qué segundo debe sonar</span><input type="number" min={0} max={10000} step={1} value={start} onChange={e=>setDraftEvent(prev=>({...prev,[main?'music_general_start':'music_special_start']:Math.max(0,Number(e.target.value))}))}/></label><div className="music-duration"><Clock3 size={17}/> Repetición automática de <strong>30 segundos</strong></div></div>
      <div className="music-buttons"><button className="btn outline" disabled={!url||!checkLink(url)} onClick={()=>changePreview(track)}>{previewAudio===track?<Pause size={16}/>:<Play size={16}/>} {previewAudio===track?'Pausar prueba':'Probar fragmento'}</button><button className="btn primary" onClick={()=>void saveEvent()} disabled={working}><Save size={16}/> Guardar canción</button></div>
      {previewAudio===track&&<audio ref={previewRef} src={url} onTimeUpdate={e=>{if(e.currentTarget.currentTime>=start+30)e.currentTarget.currentTime=start}} onEnded={e=>{e.currentTarget.currentTime=start;void e.currentTarget.play()}} onPause={()=>{}} />}
    </Card>;
  };
  return <div className="admin-app">
    <aside className={`sidebar ${menuOpen?'expanded':''}`}>
      <div className="side-brand"><div className="brand-mark">EA<span>✦</span></div><div><strong>CELEBRAR</strong><small>EMILIANA & ALEJANDRA</small></div></div>
      <div className="nav-label">MI ESTUDIO</div>
      <nav>{TABS.map(x=><button key={x.id} className={`nav-link ${tab===x.id?'active':''}`} onClick={()=>{setTab(x.id);setMenuOpen(false)}}><x.Icon size={19}/>{x.label}{x.id==='invitaciones'&&waiting>0&&<i>{waiting}</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="side-message"><Sparkles size={19}/><strong>Una celebración. Dos grandes sueños.</strong><p>Emiliana · 5.º & Alejandra · 11.º</p></div><span className="connection"><span className={`connection-dot ${cloudEnabled?'on':''}`}/>{cloudEnabled?'Conectado a Supabase':'Modo demostración local'}</span></div>
    </aside>
    <div className="admin-body">
      <header className="admin-top"><div className="crumb"><button className="menu-trigger" onClick={()=>setMenuOpen(!menuOpen)}><Menu size={21}/></button><span>CELEBRAR</span><ChevronRight size={14}/><strong>{TABS.find(x=>x.id===tab)?.label}</strong></div><div className="top-actions"><span className="top-tag"><Sparkles size={14}/> Doble graduación</span><button className="btn small ghost" onClick={()=>setPreview(true)}><ExternalLink size={16}/> Ver plantilla</button><div className="avatar">EA</div></div></header>
      <main className="workspace">
        {!cloudEnabled&&<div className="cloud-banner"><ShieldCheck size={18}/><div><strong>Modo demostración: los datos se guardan en este navegador.</strong> Para compartir enlaces reales, guardar fotos y música en la nube, configura Supabase y las variables del repositorio.</div><a href="https://supabase.com/dashboard/projects" target="_blank" rel="noreferrer">Abrir Supabase <ExternalLink size={13}/></a></div>}
        {tab==='resumen'&&<>
          <div className="hero-dashboard"><div className="hero-copy"><div className="eyebrow">BIENVENIDO AL ESTUDIO</div><h1>Dos historias.<br/><em>Una gran celebración.</em></h1><p>Organiza a tus invitados, comparte sus invitaciones y celebra cada confirmación.</p><div className="hero-actions"><button className="btn gold" onClick={()=>{setTab('invitaciones');openGuest()}}><Plus size={17}/> Crear invitación</button><button className="btn light-outline" onClick={()=>setTab('galerias')}><ImagePlus size={18}/> Agregar fotografías</button></div></div><div className="hero-art"><span className="hero-art-ring"/><span className="cap-a">✦</span><span className="hero-art-cursive">Emiliana <i>&</i><br/> Alejandra</span><span className="hero-art-year">5.º GRADO <b>•</b> 11.º GRADO</span><span className="star-small">✧</span></div></div>
          <div className="metrics"><Metric label="Invitaciones" value={guests.length} icon={<Send/>} foot="registradas"/><Metric label="Ya enviadas" value={sent} icon={<CheckCheck/>} foot="marcadas como enviadas"/><Metric label="Confirmadas" value={confirmed} icon={<Heart/>} foot="respuestas positivas"/><Metric label="Pendientes de envío" value={waiting} icon={<Clock3/>} foot="por compartir"/></div>
          <div className="two-columns"><Card><div className="section-head"><div><h3>Invitaciones recientes</h3><p>Haz seguimiento a tus invitados</p></div><button className="text-button" onClick={()=>setTab('invitaciones')}>Ver todas <ArrowRight size={16}/></button></div>{guests.length===0?<Empty icon={<Send/>} heading="Tu lista comienza aquí" desc="Crea la primera invitación personalizada." action={<button className="btn primary" onClick={()=>openGuest()}><Plus size={16}/> Nueva invitación</button>}/>:<div className="mini-list">{guests.slice(0,5).map(g=><div className="mini-row" key={g.id}><span className="mini-avatar">{g.name.slice(0,1).toUpperCase()}</span><div><strong>{g.name}</strong><small>{data.groups.find(x=>x.id===g.group_id)?.name||'Sin grupo'} · {g.seats} cupos</small></div><Pill tone={g.sent?'green':'gold'}>{g.sent?'Enviada':'Por enviar'}</Pill></div>)}</div>}</Card>
          <Card><div className="section-head"><div><h3>El día especial</h3><p>Todos los detalles en un lugar</p></div><CalendarDays size={20}/></div><div className="event-date"><span>✧</span><strong>{dateLabel(draftEvent.date)}</strong><small>{draftEvent.venue||'Lugar por confirmar'}</small></div><div className="progress-box"><div><strong>Avance de envíos</strong><span>{guests.length?Math.round(sent*100/guests.length):0}%</span></div><div className="progress"><i style={{width:`${guests.length?sent*100/guests.length:0}%`}}/></div><small>{sent} de {guests.length} invitaciones enviadas · {quota} cupos disponibles</small></div><button className="btn outline full" onClick={()=>setTab('evento')}>Configurar evento <ArrowRight size={16}/></button></Card></div>
        </>}
        {tab==='invitaciones'&&<>
          <Heading eyebrow="CADA PERSONA IMPORTA" title="Invitaciones personalizadas" desc="Registra invitados, asigna cupos y grupos, y marca cuándo hayas enviado cada invitación." action={<button className="btn primary" onClick={()=>openGuest()}><Plus size={17}/> Nueva invitación</button>}/>
          <div className="invite-toolbar"><div className="search-wrap"><Search size={18}/><input placeholder="Buscar invitado o grupo" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Filtrar estado" value={filter} onChange={e=>setFilter(e.target.value)}><option value="todos">Todos los invitados</option><option value="no_enviadas">Pendientes de envío</option><option value="enviadas">Ya enviadas</option><option value="confirmadas">Confirmadas</option></select><button className="btn outline" onClick={exportCSV}><Download size={17}/> Exportar CSV</button></div>
          <div className="quick-filters"><Pill tone="blue">{guests.length} invitaciones</Pill><Pill tone="green">{sent} enviadas</Pill><Pill tone="gold">{waiting} sin enviar</Pill></div>
          {filtered.length===0?<Card><Empty icon={<UserRound/>} heading={guests.length?'No hay coincidencias':'Todavía no hay invitados'} desc={guests.length?'Prueba con otro nombre o filtro.':'Crea la primera invitación y comienza a enviarla por WhatsApp.'} action={<button className="btn primary" onClick={()=>openGuest()}><Plus size={16}/> Crear invitación</button>}/></Card>:<Card className="table-panel"><div className="table-scroll"><table><thead><tr><th>Invitado</th><th>Grupo · Música</th><th>Cupos</th><th>Envío</th><th>Asistencia</th><th>Acciones</th></tr></thead><tbody>{filtered.map(g=><tr key={g.id}><td><div className="guest-name"><span className="mini-avatar">{g.name.slice(0,1).toUpperCase()}</span><div><strong>{g.name}</strong><small>{g.phone||'Sin WhatsApp registrado'}</small></div></div></td><td><div className="table-group"><strong>{data.groups.find(x=>x.id===g.group_id)?.name||'Sin grupo'}</strong><small><Music2 size={12}/> {getTrack(g,data.groups)==='especial'?'Especial':'General'}</small></div></td><td>{g.seats}</td><td><label className="sent-toggle"><input type="checkbox" checked={g.sent} disabled={working} onChange={()=>void toggleSent(g)}/><span className={g.sent?'sent-yes':''}>{g.sent?'Enviada':'Marcar enviada'}</span></label>{g.sent_at&&<small className="sent-date">{compactDate(g.sent_at)}</small>}</td><td><StatusPill status={g.status}/></td><td><div className="row-actions"><button title="Copiar enlace" onClick={()=>void copyLink(linkFor(g)).then(()=>notify('Enlace personalizado copiado'))}><Copy size={16}/></button><a href={whatsappFor(g)} target="_blank" rel="noreferrer" title="Enviar por WhatsApp"><MessageCircle size={17}/></a><a href={`#/invitacion/${g.share_token}`} target="_blank" rel="noreferrer" title="Abrir invitación"><ExternalLink size={16}/></a><button title="Editar invitación" onClick={()=>setGuestEdit(g)}><Edit3 size={16}/></button><button className="red" title="Eliminar invitación" onClick={()=>{if(window.confirm(`¿Eliminar la invitación de ${g.name}?`))void perform(()=>deleteGuest(g.id,data),'Invitación eliminada')}}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div></Card>}
        </>}
        {tab==='grupos'&&<>
          <Heading eyebrow="ORGANIZA A TU GENTE" title="Grupos de invitados" desc="Cada grupo usa la canción general o la especial. Los invitados sin grupo escuchan la general." action={<button className="btn primary" onClick={()=>setGroupEdit(newGroup(data.event.id))}><Plus size={17}/> Crear grupo</button>}/>
          <div className="group-grid"><Card className="group-special"><div className="group-card-icon"><Users size={24}/></div><h3>Sin asignar grupo</h3><p>Personas que todavía no tienen un grupo asociado.</p><div className="group-bottom"><span>{guests.filter(g=>!g.group_id).length} invitados</span><Pill tone="blue">Música general</Pill></div></Card>{data.groups.map(g=><Card className="group-card" key={g.id}><div className="group-top"><div className="group-card-icon"><Users size={23}/></div><div><button aria-label="Editar grupo" onClick={()=>setGroupEdit(g)}><Edit3 size={16}/></button><button aria-label="Borrar grupo" onClick={()=>{if(window.confirm(`¿Eliminar ${g.name}? Sus invitados pasarán a Sin grupo.`))void perform(()=>deleteGroup(g.id,data),'Grupo eliminado')}}><Trash2 size={16}/></button></div></div><h3>{g.name}</h3><p>Grupo de invitaciones para compartir</p><div className="group-bottom"><span>{guests.filter(x=>x.group_id===g.id).length} invitados</span><Pill tone={g.track==='especial'?'gold':'blue'}>Música {g.track}</Pill></div></Card>)}<button className="group-add" onClick={()=>setGroupEdit(newGroup(data.event.id))}><Plus size={31}/><strong>Agregar grupo</strong><small>Con su música y cupos</small></button></div>
          <Card className="help-band"><Music2 size={22}/><div><strong>Dos canciones, todos los grupos que necesites.</strong><p>Configura los archivos en Música; luego elige «General» o «Especial» al crear cada grupo. La invitación utilizará automáticamente la canción asignada al grupo.</p></div><button className="btn outline" onClick={()=>setTab('musica')}>Ir a música <ArrowRight size={15}/></button></Card>
        </>}
        {tab==='galerias'&&<>
          <Heading eyebrow="RECUERDOS INOLVIDABLES" title="Galerías de fotografías" desc="Cuatro álbumes independientes para contar cada etapa de la historia. Sube varias fotos, ordénalas y aparecen automáticamente en todas las invitaciones."/>
          <div className="gallery-manager">{COLLECTIONS.map(album=><Card className="gallery-panel" key={album.id}><div className="gallery-panel-head"><div className="gallery-monogram">{album.icon}</div><div><h3>{album.title}</h3><p>{album.subtitle}</p></div><Pill tone="blue">{draftEvent.galleries[album.id]?.length||0} fotos</Pill></div><div className="gallery-toolbar"><label className="btn primary upload-button"><ImagePlus size={16}/>{uploadBusy===album.id?'Subiendo fotos…':'Subir varias fotos'}<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" disabled={Boolean(uploadBusy)} onChange={e=>void fileUpload(e.target.files,album.id)}/></label><button className="btn outline" onClick={()=>void addPhotoUrl(album.id)}><Link2 size={16}/> Añadir enlace</button></div><div className="manage-photo-grid">{(draftEvent.galleries[album.id]||[]).map((photo,index)=><div className="manage-photo" key={photo.id}><img src={photo.url} alt={photo.caption||`Foto ${index+1}`}/><div className="manage-photo-actions"><button title="Mover a la izquierda" onClick={()=>void movePhoto(album.id,photo.id,-1)}><ArrowLeft size={13}/></button><button title="Mover a la derecha" onClick={()=>void movePhoto(album.id,photo.id,1)}><ArrowRight size={13}/></button><button title="Quitar foto" onClick={()=>void removePhoto(album.id,photo.id)}><X size={13}/></button></div></div>)}{draftEvent.galleries[album.id]?.length===0&&<div className="gallery-no-photos"><Camera size={31}/><span>Aquí aparecerán tus fotografías</span></div>}</div></Card>)}</div>
        </>}
        {tab==='musica'&&<>
          <Heading eyebrow="EL SOUNDTRACK DE ESTA HISTORIA" title="Música de las invitaciones" desc="Sube dos canciones o utiliza enlaces directos. Cada una se reproducirá desde el segundo elegido durante 30 segundos en un bucle continuo."/>
          <div className="music-grid">{panelMusic('general')}{panelMusic('especial')}</div><Card className="help-band"><Volume2 size={24}/><div><strong>La música comienza cuando el invitado abre el sobre.</strong><p>Los navegadores necesitan una interacción antes de reproducir audio. No uses enlaces de YouTube o Spotify: necesitas MP3, M4A, OGG o WAV propios o autorizados.</p></div></Card>
        </>}
        {tab==='evento'&&<>
          <Heading eyebrow="LOS DETALLES DEL GRAN DÍA" title="Personaliza la celebración" desc="Esta información aparecerá en todas las invitaciones y se actualizará al guardar." action={<button className="btn primary" disabled={working} onClick={()=>void saveEvent()}><Save size={17}/> Guardar cambios</button>}/>
          <div className="settings-grid"><Card><h3>Mensaje de bienvenida</h3><div className="form-grid"><label className="field full"><span>Título principal</span><input value={draftEvent.title} onChange={e=>setDraftEvent({...draftEvent,title:e.target.value})}/></label><label className="field full"><span>Mensaje especial</span><textarea rows={4} value={draftEvent.message} onChange={e=>setDraftEvent({...draftEvent,message:e.target.value})}/></label><label className="field full"><span>Mensaje de despedida</span><textarea rows={3} value={draftEvent.closing} onChange={e=>setDraftEvent({...draftEvent,closing:e.target.value})}/></label></div></Card>
          <Card><h3>Fecha, lugar y asistencia</h3><div className="form-grid"><label className="field full"><span>Fecha y hora del evento (Colombia)</span><input type="datetime-local" value={localInputDate(draftEvent.date)} onChange={e=>setDraftEvent({...draftEvent,date:isoColombia(e.target.value)})}/></label><label className="field full"><span>Nombre del lugar</span><input value={draftEvent.venue} onChange={e=>setDraftEvent({...draftEvent,venue:e.target.value})}/></label><label className="field full"><span>Dirección</span><input value={draftEvent.address} onChange={e=>setDraftEvent({...draftEvent,address:e.target.value})}/></label><label className="field full"><span>Enlace de Google Maps</span><input value={draftEvent.maps_url} onChange={e=>setDraftEvent({...draftEvent,maps_url:e.target.value})} placeholder="https://maps.google.com/..."/></label><label className="field full"><span>Fecha límite de confirmación (opcional)</span><input type="date" value={draftEvent.rsvp_deadline} onChange={e=>setDraftEvent({...draftEvent,rsvp_deadline:e.target.value})}/></label></div></Card></div>
          <Card className="help-band"><Heart size={23}/><div><strong>La fecha y el lugar todavía pueden quedar pendientes.</strong><p>No inventamos esos datos: mientras los completas aparecerá «Por confirmar».</p></div></Card>
        </>}
        {tab==='confirmaciones'&&<>
          <Heading eyebrow="LA ALEGRÍA DE CADA RESPUESTA" title="Confirmaciones de asistencia" desc="Consulta quienes asistirán, quienes no podrán venir y cuántos cupos han confirmado." action={<button className="btn outline" onClick={exportCSV}><Download size={16}/> Exportar CSV</button>}/>
          <div className="metrics"><Metric label="Confirmados" value={confirmed} icon={<CheckCircle2/>} foot="invitaciones"/><Metric label="Asistentes" value={guests.reduce((n,g)=>n+(g.status==='confirmada'?g.attending_count:0),0)} icon={<Users/>} foot="personas"/><Metric label="No asistirán" value={guests.filter(g=>g.status==='no_asistira').length} icon={<X/>} foot="respuestas"/><Metric label="Sin respuesta" value={guests.filter(g=>g.status==='pendiente').length} icon={<Clock3/>} foot="invitaciones"/></div>
          <Card className="table-panel"><div className="table-scroll"><table><thead><tr><th>Invitado</th><th>Respuesta</th><th>Cupos</th><th>Asistentes</th><th>Mensaje</th></tr></thead><tbody>{guests.length===0?<tr><td colSpan={5} className="table-empty">Las confirmaciones aparecerán aquí.</td></tr>:guests.map(g=><tr key={g.id}><td><strong>{g.name}</strong></td><td><StatusPill status={g.status}/></td><td>{g.seats}</td><td>{g.attending_count}</td><td className="message-cell">{g.message||'—'}</td></tr>)}</tbody></table></div></Card>
        </>}
        <div className="workspace-footer">EMILIANA & ALEJANDRA <span>✦</span> CREADO CON CARIÑO</div>
      </main>
    </div>
    {guestEdit&&<GuestDialog initial={guestEdit} groups={data.groups} onClose={()=>setGuestEdit(null)} onSave={saveGuest} busy={working}/>}
    {groupEdit&&<GroupDialog initial={groupEdit} onClose={()=>setGroupEdit(null)} onSave={saveGroup} busy={working}/>}
    {notice&&<div className="toast" role="status"><Sparkles size={17}/>{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
  </div>;
}

function Metric({label,value,icon,foot}:{label:string;value:number;icon:ReactNode;foot:string}){return <Card className="metric-card"><div className="metric-top"><span>{label}</span><div>{icon}</div></div><strong>{value}</strong><small>{foot}</small></Card>}
function GuestDialog({initial,groups,onClose,onSave,busy}:{initial:Guest;groups:Group[];onClose:()=>void;onSave:(g:Guest)=>Promise<void>;busy:boolean}){
  const [guest,setGuest]=useState(initial);
  const track=groups.find(g=>g.id===guest.group_id)?.track||'general';
  return <div className="modal-back" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Editar invitación"><div className="modal-head"><div><div className="eyebrow">INVITACIÓN PERSONALIZADA</div><h2>{initial.name?'Editar invitado':'Nueva invitación'}</h2></div><button onClick={onClose}><X size={22}/></button></div><div className="form-grid"><label className="field full"><span>Nombre que aparecerá en la invitación *</span><input autoFocus placeholder="Ej. Familia Pérez" value={guest.name} onChange={e=>setGuest({...guest,name:e.target.value})}/></label><label className="field"><span>Grupo</span><select value={guest.group_id||''} onChange={e=>{const group=groups.find(g=>g.id===e.target.value);setGuest({...guest,group_id:group?.id||null,seats:group?.default_seats||guest.seats})}}><option value="">Sin grupo</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label><label className="field"><span>Cantidad de cupos</span><input type="number" min={1} max={50} value={guest.seats} onChange={e=>setGuest({...guest,seats:Math.min(50,Math.max(1,Number(e.target.value)))})}/></label><label className="field full"><span>WhatsApp (opcional)</span><input placeholder="+57 300 000 0000" value={guest.phone} onChange={e=>setGuest({...guest,phone:e.target.value})}/></label></div><div className="modal-info"><Music2 size={19}/> Esta invitación usará la <strong>canción {track==='especial'?'especial':'general'}</strong> del grupo. Puedes cambiarla en «Grupos y música».</div><div className="modal-actions"><button className="btn outline" onClick={onClose}>Cancelar</button><button disabled={busy||!guest.name.trim()} className="btn primary" onClick={()=>void onSave(guest)}><Save size={16}/> Guardar invitación</button></div></div></div>;
}
function GroupDialog({initial,onClose,onSave,busy}:{initial:Group;onClose:()=>void;onSave:(g:Group)=>Promise<void>;busy:boolean}){
  const [group,setGroup]=useState(initial);
  return <div className="modal-back" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Configurar grupo"><div className="modal-head"><div><div className="eyebrow">ORGANIZA A TUS INVITADOS</div><h2>{initial.name?'Editar grupo':'Crear grupo'}</h2></div><button onClick={onClose}><X size={22}/></button></div><div className="form-grid"><label className="field full"><span>Nombre del grupo *</span><input autoFocus placeholder="Familia, Amigos, Docentes…" value={group.name} onChange={e=>setGroup({...group,name:e.target.value})}/></label><label className="field"><span>Cupos sugeridos</span><input type="number" min={1} max={50} value={group.default_seats} onChange={e=>setGroup({...group,default_seats:Math.min(50,Math.max(1,Number(e.target.value)))})}/></label><label className="field"><span>Canción que escuchará el grupo</span><select value={group.track} onChange={e=>setGroup({...group,track:e.target.value as TrackId})}><option value="general">General · Canción 1</option><option value="especial">Especial · Canción 2</option></select></label></div><div className="modal-info"><Music2 size={19}/> Todos los invitados de este grupo escucharán la pista seleccionada automáticamente al abrir su invitación.</div><div className="modal-actions"><button className="btn outline" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!group.name.trim()||busy} onClick={()=>void onSave(group)}><Check size={17}/> Guardar grupo</button></div></div></div>;
}

function GradCountdown({date}:{date:string}){
  const [tick,setTick]=useState(0);
  useEffect(()=>{const t=window.setInterval(()=>setTick(v=>v+1),1000);return ()=>clearInterval(t)},[]);
  void tick;
  const c=countdown(date);
  return <div className="public-countdown"><div className="section-kicker">LA CUENTA REGRESIVA</div><h2>{c?.past?'¡Llegó nuestro gran día!':'Cada segundo nos acerca a este sueño'}</h2>{c&&!c.past?<div className="count-row">{([['Días',c.days],['Horas',c.hours],['Minutos',c.minutes],['Segundos',c.seconds]] as [string,number][]).map(([label,value])=><div key={label}><strong>{formatCount(value)}</strong><small>{label}</small></div>)}</div>:<p>{date?'Gracias por ser parte de esta celebración.':'Muy pronto anunciaremos la fecha y la hora.'}</p>}</div>;
}
function Photo({photo,album,index}:{photo?:Photo;album:string;index:number}){return <div className={`memory-photo memory-photo-${index%4}`}>{photo?.url?<img loading="lazy" src={photo.url} alt={photo.caption||album}/>:<div className="photo-placeholder"><Camera size={29}/><span>{album}</span></div>}{photo?.caption&&<small>{photo.caption}</small>}</div>}
function MemoryAlbum({id,photos}:{id:AlbumId;photos:Photo[]}){
  const album=COLLECTIONS.find(a=>a.id===id)!;
  return <section className={`memory-album album-${id}`}><div className="memory-album-head"><span className="section-kicker">{album.icon} UNA GALERÍA ESPECIAL</span><h2>{album.title}</h2><p>{album.subtitle}</p></div><div className="memory-gallery">{(photos.length?photos:Array.from({length:id==='juntas'?3:2},()=>undefined)).map((p,i)=><Photo key={p?.id??i} photo={p} album={album.title} index={i}/>)}</div></section>;
}
function PublicInvitation({data,demo=false,onBack}:{data:PublicInvite;demo?:boolean;onBack?:()=>void}){
  const {event,guest,track}=data;
  const [phase,setPhase]=useState<'closed'|'opening'|'ready'>('closed');
  const [muted,setMuted]=useState(false);
  const [reply,setReply]=useState<RSVP>(guest.status==='no_asistira'?'no_asistira':'confirmada');
  const [count,setCount]=useState(Math.max(1,guest.attending_count||1));
  const [text,setText]=useState(guest.message||'');
  const [saved,setSaved]=useState(false);
  const [sending,setSending]=useState(false);
  const [err,setErr]=useState('');
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const timeRef=useRef<number|null>(null);
  const progressRef=useRef<HTMLElement|null>(null);
  const audioUrl=track==='especial'?event.music_special_url:event.music_general_url;
  const audioStart=track==='especial'?event.music_special_start:event.music_general_start;
  const open=()=>{
    if(phase!=='closed')return;
    const audio=audioRef.current;
    if(audio&&audioUrl&&!muted){try{audio.currentTime=audioStart||0}catch{/* waiting for metadata */}void audio.play().catch(()=>setMuted(true))}
    setPhase('opening');
    timeRef.current=window.setTimeout(()=>{setPhase('ready');},3100);
  };
  useEffect(()=>()=>{if(timeRef.current!==null)window.clearTimeout(timeRef.current)},[]);
  const playAgain=()=>{const audio=audioRef.current;if(!audio)return;audio.muted=false;setMuted(false);void audio.play().catch(()=>setMuted(true))};
  const saveReply=async(e:FormEvent)=>{
    e.preventDefault();if(demo){setSaved(true);return}
    setSending(true);setErr('');
    try{await sendRSVP(guest.share_token,reply,reply==='confirmada'?count:0,text);setSaved(true)}
    catch(error){setErr((error as Error).message)}finally{setSending(false)}
  };
  const total=Object.values(event.galleries).reduce((sum,photos)=>sum+photos.length,0);
  return <div className="public-page">
    <audio ref={audioRef} src={audioUrl||undefined} preload="auto" loop onLoadedMetadata={e=>{if(phase==='opening')try{e.currentTarget.currentTime=audioStart||0}catch{/* silent */}}} onTimeUpdate={e=>{if(e.currentTarget.currentTime>=Number(audioStart||0)+30)e.currentTarget.currentTime=Number(audioStart||0)}} onEnded={e=>{e.currentTarget.currentTime=audioStart||0;void e.currentTarget.play()}}/>
    {phase!=='ready'&&<section className={`invite-intro invite-${phase}`}><Starfield count={42}/><div className="intro-topline">UNA INVITACIÓN MUY ESPECIAL</div><h1>Hay algo <em>hermoso</em> para ti</h1><p>Dos hermanas. Dos grandes sueños. Una celebración.</p><div className="envelope-stage"><span className="intro-glow"/><button type="button" disabled={phase!=='closed'} className="envelope-click" aria-label="Abrir la invitación" onClick={open}><span className="env-body"><span className="env-back"/><span className="env-letter"><span className="env-inner"><GraduationCap size={36}/><em>Emiliana & Alejandra</em><b>Dos sueños cumplidos</b><small>UNA NOCHE ESPECIAL</small></span></span><span className="env-flap"/><span className="env-pocket"/></span><span className="env-seal">EA</span></button><span className="env-shadow"/></div><button className="intro-open" disabled={phase!=='closed'} onClick={open}>{phase==='closed'?'Abrir mi invitación':'Descubriendo tu sorpresa…'} <Sparkles size={19}/></button><p className="intro-footer">HECHA ESPECIALMENTE PARA <strong>{guest.name}</strong></p><div className="intro-stars-burst" aria-hidden="true">{Array.from({length:30},(_,i)=><span key={i} style={{'--ang':`${(i*137.5)%360}deg`,'--dist':`${100+(i%5)*55}px`,'--del':`${(i%8)*.09}s`} as CSSProperties}>✦</span>)}</div></section>}
    {phase==='ready'&&<>
      <header className="invite-header"><span><GraduationCap size={22}/> <em>Emiliana & Alejandra</em></span><div><button aria-label={muted?'Activar música':'Silenciar música'} onClick={()=>{if(muted){playAgain()}else{setMuted(true);if(audioRef.current)audioRef.current.muted=true}}}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button>{onBack&&<button onClick={onBack} aria-label="Volver al panel"><X size={20}/></button>}</div></header>
      <section className="invite-cover" ref={el=>{progressRef.current=el}}><Starfield count={48}/><div className="cover-ring"/><div className="cover-orbit"/><div className="cover-caption">UNA NOCHE PARA CELEBRAR</div><div className="cover-crest">EA <span>✦</span></div><h1><em>Emiliana</em><span>&</span><em>Alejandra</em></h1><div className="cover-grades"><div><span>El gran paso</span><strong>5.º GRADO</strong></div><i>✧</i><div><span>Un nuevo comienzo</span><strong>11.º GRADO</strong></div></div><p>{event.message}</p><div className="guest-display"><small>INVITACIÓN ESPECIAL PARA</small><strong>{guest.name}</strong><span>{guest.seats} {guest.seats===1?'CUPO':'CUPOS'} RESERVADOS</span></div><a href="#nuestra-historia" className="explore-link">DESCUBRE NUESTRA HISTORIA <ArrowDown size={16}/></a></section>
      <section className="sisters-story" id="nuestra-historia"><div className="section-kicker">DOS HISTORIAS ENTRELAZADAS</div><h2>El principio de <em>nuevas aventuras</em></h2><p>Crecieron compartiendo risas, retos y sueños. Hoy celebramos dos etapas únicas que las llevarán aún más lejos.</p><div className="story-twins"><article><div className="twin-badge">05</div><GraduationCap size={31}/><h3>Emiliana</h3><span>Promoción de 5.º grado</span><p>Una nueva etapa comienza con curiosidad, alegría y muchas ilusiones.</p></article><div className="twin-divider">✦</div><article><div className="twin-badge">11</div><GraduationCap size={31}/><h3>Alejandra</h3><span>Promoción de grado 11</span><p>Un sueño se hace realidad y se abren las puertas a nuevos caminos.</p></article></div></section>
      <MemoryAlbum id="juntas" photos={event.galleries.juntas}/><MemoryAlbum id="emiliana" photos={event.galleries.emiliana}/><MemoryAlbum id="alejandra" photos={event.galleries.alejandra}/><MemoryAlbum id="familia" photos={event.galleries.familia}/>
      <section className="invite-details"><div className="section-kicker">GUARDA ESTE MOMENTO</div><h2>Fecha, hora <em>y lugar</em></h2><div className="detail-boxes"><article><CalendarDays size={27}/><span>CUÁNDO CELEBRAMOS</span><h3>{dateLabel(event.date)}</h3></article><article><MapPin size={27}/><span>DÓNDE NOS VEREMOS</span><h3>{event.venue||'Por confirmar'}</h3><p>{event.address}</p>{event.maps_url&&checkLink(event.maps_url)&&<a href={event.maps_url} target="_blank" rel="noreferrer">Ver ubicación <ExternalLink size={15}/></a>}</article></div><GradCountdown date={event.date}/></section>
      <section className="invite-rsvp"><div className="rsvp-decoration">✦</div><div className="section-kicker">QUEREMOS CELEBRAR CONTIGO</div><h2>Tu presencia hará este día <em>aún más especial</em></h2><p>Reserva tu lugar y confírmanos si nos acompañarás.</p>{saved?<div className="rsvp-success"><CheckCircle2 size={45}/><h3>¡Gracias por responder!</h3><p>Hemos recibido tu confirmación.</p></div>:<form className="rsvp-form" onSubmit={e=>void saveReply(e)}><label>Tu nombre<input value={guest.name} disabled/></label><div className="rsvp-choice"><button type="button" className={reply==='confirmada'?'selected':''} onClick={()=>setReply('confirmada')}><Heart size={18}/> ¡Sí, asistiré!</button><button type="button" className={reply==='no_asistira'?'selected':''} onClick={()=>setReply('no_asistira')}><X size={18}/> No podré asistir</button></div>{reply==='confirmada'&&<label>¿Cuántas personas asistirán? <select value={count} onChange={e=>setCount(Number(e.target.value))}>{Array.from({length:guest.seats},(_,i)=><option key={i+1} value={i+1}>{i+1} {i===0?'persona':'personas'}</option>)}</select><small>Tienes {guest.seats} {guest.seats===1?'cupo disponible':'cupos disponibles'}.</small></label>}<label>Mensaje para las graduandas (opcional)<textarea rows={3} value={text} maxLength={1000} onChange={e=>setText(e.target.value)} placeholder="¡Muchas felicidades!"/></label>{err&&<div className="error-inline">{err}</div>}<button className="btn rsvp-submit" disabled={sending}>{sending?<Loader2 size={16} className="spin"/>:<Send size={17}/>} Confirmar mi respuesta</button></form>}<div className="rsvp-ending">{event.closing}<br/><em>Con cariño, Emiliana y Alejandra</em></div></section>
      <footer className="invite-footer">E <span>✦</span> A · DOS SUEÑOS, UNA CELEBRACIÓN{total>0&&<small>{total} recuerdos para atesorar</small>}</footer>
    </>}
  </div>;
}
function PublicRoute({token}:{token:string}){
  const [data,setData]=useState<PublicInvite|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;setLoading(true);void publicInvitation(token).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError((e as Error).message)}).finally(()=>{if(active)setLoading(false)});return ()=>{active=false}},[token]);
  if(loading)return <div className="loading-screen public-loading"><Loader2 className="spin" size={38}/><h2>Preparando tu invitación…</h2></div>;
  if(!data)return <div className="loading-screen public-loading"><GraduationCap size={49}/><h2>Esta invitación no está disponible</h2><p>{error||'Revisa el enlace que recibiste.'}</p><a className="btn outline" href="#/">Volver</a></div>;
  return <PublicInvitation data={data}/>;
}
export default function App(){
  const [hash,setHash]=useState(location.hash);
  useEffect(()=>{const h=()=>setHash(location.hash);window.addEventListener('hashchange',h);return()=>window.removeEventListener('hashchange',h)},[]);
  const match=hash.match(/^#\/invitacion\/([0-9a-f]{64})$/i);
  return match?<PublicRoute token={match[1]}/>:<DashboardAdmin/>;
}