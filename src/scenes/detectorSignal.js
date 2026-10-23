import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { Chart } from '../core/chart.js';
import { section, slider, segmented, readouts, note, para, table, sources, buttons, h } from '../core/ui.js';
import { M } from '../core/materials.js';
import { mesh, roundedBox, wire } from '../core/geom.js';
import { buildDaly } from '../components/daly.js';
import { buildSEM } from '../components/sem.js';
import { registerParts } from '../components/parts.js';
import { discriminatorEvents, pulseWaveform } from '../physics/amplifier.js';
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const STEPS={
 daly:[['Ion conversion','An ion strikes the negative conversion knob and releases secondary electrons. The original ion stops here.'],['Electron acceleration','Secondary electrons accelerate from the knob toward the scintillator. The electric field supplies their energy.'],['Scintillation light','Electron impacts generate photons. Light crosses the vacuum window; this is where the signal changes from electrons to photons.'],['Photoelectric conversion','At the PMT photocathode, some photons release photoelectrons. Quantum efficiency and collection efficiency affect detection probability.'],['Dynode multiplication','A voltage-divider chain biases successive PMT dynodes. Each impact releases more electrons. The display caps the visible population; it is not a count of every electron.'],['Anode & readout','The anode collects the electron cloud. A preamplifier shapes the pulse; a discriminator and counter decide whether it becomes a recorded event.']],
 sem:[['First-dynode ion impact','The ion directly strikes dynode 1. A few secondary electrons begin the cascade; if none are emitted, the ion is missed.'],['Acceleration to dynode 2','The potential difference between dynodes accelerates electrons. The DC high-voltage supply, through the divider, supplies the multiplication energy.'],['First multiplication stages','Each electron impact can release several secondaries. Gain is the product of the individual stage yields.'],['Later multiplication stages','The cascade grows through the remaining dynodes. Gain and timing spreads vary; surface aging and voltage changes can shift the pulse-height distribution.'],['Anode collection','The anode collects the multiplied electrons and produces a brief electrical pulse. Electron gain is not the same as detection efficiency.'],['Pulse discrimination','The shaped pulse must exceed a threshold while the counter is ready. A subthreshold pulse or a pulse inside dead time is not counted.']],
};
export default{
 id:'detectorSignal',title:'Inside the detector signal chain',group:'Detectors',icon:'⋱',blurb:'Step through Daly / SEM conversion, dynodes, pulse shaping & counting',
 async create(ctx){
  const root=new THREE.Group(),ex=new Exploder(),S={kind:new URLSearchParams(location.hash.slice(1)).get('detector')==='sem'?'sem':'daly',step:0,phase:0,playing:false,threshold:.4,dead:20};
  let model,paths,targets,stageControls,stageText;let electronics;
  const particles=new THREE.Group();particles.userData.beam=true;root.add(particles);
  const dots=Array.from({length:30},()=>{const p=mesh(new THREE.SphereGeometry(.0008,10,8),new THREE.MeshBasicMaterial({color:0x7fe0ff}));particles.add(p);return p;});
  const start=new THREE.Object3D();start.position.set(0,0,-.09);root.add(start);
  const status=readouts([{id:'stage',label:'Signal carrier'},{id:'progress',label:'Replay progress'}]);
  function build(){
   if(model){model.group.traverse(o=>{if(o.isCSS2DObject)o.element.remove();o.geometry?.dispose();});root.remove(model.group);electronics.traverse(o=>{if(o.isCSS2DObject)o.element.remove();o.geometry?.dispose();});root.remove(electronics);}
   ex.clear();model=S.kind==='daly'?buildDaly({detail:'full'}):buildSEM({detail:'full',variant:'discrete'});root.add(model.group);registerParts(ex,model.parts);
   electronics=new THREE.Group();root.add(electronics);const x=S.kind==='daly'?.19:.07,z=S.kind==='daly'?.046:.07;
   const boards=[];
   for(let i=0;i<3;i++){const b=mesh(roundedBox(.028,.012,.025,.002),i===2?M.pcb():M.black());b.position.set(x+i*.037,0,z);electronics.add(b);ex.add(b,[0,(i+1)*.012,.016],{name:['Preamplifier','Discriminator','Counter / digital output'][i],info:['Converts and shapes the anode current pulse into a voltage suitable for downstream electronics. Width and amplitude affect pulse separation.','A threshold crossing can trigger an event. A pulse that is too small is rejected; threshold selection trades noise rejection against missed real events.','Records accepted triggers. In the illustrative non-paralyzable model, a counted event starts a fixed busy interval; arrivals during that interval are lost without extending it.'][i],order:.85});ctx.label(b,['Pulse preamp','Discriminator','Counter'][i],{offset:[0,.012,0]});boards.push(b);}
   const m=model.markers;
   if(S.kind==='daly'){
    paths=[[start,m.knob],[m.knob,m.scint],[m.scint,m.pmtCathode],[m.pmtCathode,m.pmtDynodes[0]],[...m.pmtDynodes,m.pmtAnode],[m.pmtAnode,...boards]];
    targets=[m.knob.parent,m.scint.parent,m.pmtCathode.parent,m.pmtCathode.parent,m.pmtDynodes[5].parent,boards[1]];
    ctx.label(m.knob,'Ion conversion',{offset:[0,.015,0]});ctx.label(m.scint,'Electrons → photons',{offset:[0,.015,0]});ctx.label(m.pmtCathode,'Photons → electrons',{offset:[0,.015,0]});
   }else{
    const d=m.dynodes;paths=[[start,d[0]],[d[0],d[1]],[...d.slice(1,6)],[...d.slice(5)],[d.at(-1),m.anode],[m.anode,...boards]];
    targets=[d[0].parent,d[1].parent,d[4].parent,d[14].parent,m.anode.parent,boards[1]];
    ctx.label(d[0],'Direct ion impact',{offset:[0,.01,0]});ctx.label(d[10],'Electron cascade',{offset:[0,.015,0]});ctx.label(m.anode,'Anode',{offset:[0,.01,0]});
   }
   ex.set(ctx.app.state.explode);ctx.app.applyXray?.();ctx.app.applyBeams?.();S.step=0;S.phase=0;showStep();
  }
  const intro=section('Follow one ion to the recorded event',{icon:'⋱'});
  intro.body.append(para('Pause at a physical conversion, separate the parts with <b>Explode</b>, and use <b>Zoom to this stage</b>. The replay follows live component anchors while the model is exploded. It is a slowed conceptual signal path, not a calibrated microscopic trajectory.'),segmented({value:S.kind,options:[{value:'daly',label:'Daly → PMT'},{value:'sem',label:'Direct-dynode SEM'}],onChange:v=>{S.kind=v;const p=new URLSearchParams(location.hash.slice(1));p.set('detector',v);history.replaceState(null,'','#'+p);S.playing=false;build();play.els[1].textContent='Play stages';ctx.app.resetView();}}).el);
  const replay=section('Stage-by-stage replay',{icon:'▶'});stageControls=h('div');stageText=h('div');
  const play=buttons([{label:'Previous',onClick:()=>setStep(S.step-1)},{label:'Play stages',onClick:b=>{S.playing=!S.playing;b.textContent=S.playing?'Pause':'Play stages';}},{label:'Next stage',onClick:()=>setStep(S.step+1)},{label:'Replay stage',onClick:()=>{S.phase=0;S.playing=true;play.els[1].textContent='Pause';}},{label:'Zoom to this stage',onClick:()=>ctx.app.focusOn(targets[S.step])},{label:'Full detector',onClick:()=>ctx.app.resetView()},{label:'Explode internals',onClick:()=>ctx.app.setExplode(.8)},{label:'Assemble',onClick:()=>ctx.app.setExplode(0)}]);
  const progress=slider({label:'Progress within this stage',min:0,max:1,step:.01,value:0,onInput:v=>{S.phase=v;S.playing=false;play.els[1].textContent='Play stages';}});
  replay.body.append(stageControls,stageText,play.el,progress.el,status.el);
  function setStep(i){S.step=Math.max(0,Math.min(5,i));S.phase=0;S.playing=false;play.els[1].textContent='Play stages';showStep();}
  function showStep(){if(!stageControls)return;stageControls.replaceChildren(buttons(STEPS[S.kind].map(([title],i)=>({label:`${i+1}. ${title}`,primary:i===S.step,onClick:()=>setStep(i)}))).el);stageText.replaceChildren(para(`<b>${S.step+1}. ${STEPS[S.kind][S.step][0]}</b><br>${STEPS[S.kind][S.step][1]}`));}
  const output=section('When does the pulse count?',{icon:'∿'}),chart=new Chart(output.body,{height:185,xLabel:'time / ns',yLabel:'pulse height / relative units',xMin:0,xMax:100,yMin:0,yMax:1.6,legendPos:'tr'}),events=h('div');
  const arrivals=[10,20,48,75],amps=[1,.8,.25,1.2];
  function refresh(){const x=Array.from({length:1001},(_,i)=>i*.1),ev=discriminatorEvents(arrivals,amps,S.threshold,S.dead);chart.setSeries([{name:'Preamplifier output',color:'#5ab0ff',x,y:x.map(t=>pulseWaveform(t,arrivals,amps))}]);chart.setMarks([{y:S.threshold,color:'#ef4444',label:'threshold'},...ev.filter(e=>e.accepted).map(e=>({x0:e.time,x1:e.time+S.dead,color:'#ffb24a',alpha:.12}))]);events.replaceChildren(table(['Pulse time','Height','Counter decision'],ev.map(e=>[`${e.time} ns`,e.amplitude.toFixed(2),e.reason])));}
  output.body.append(slider({label:'Discriminator threshold',min:.1,max:1.4,step:.05,value:S.threshold,onInput:v=>{S.threshold=v;refresh();}}).el,slider({label:'Counter dead time (illustrative)',min:5,max:50,step:1,value:S.dead,unit:'ns',onInput:v=>{S.dead=v;refresh();}}).el,events,note('Independent synthetic electronics example: decisions use the supplied pulse centers and heights, with a non-paralyzable busy interval. It does not solve threshold-crossing jitter or analog pile-up. Pulse FWHM is not dead time.'));
  const notes=section('Where gain and bias enter',{icon:'ℹ',open:false});notes.body.append(para('<b>Faraday versus ion counting.</b> Faraday readout measures accumulated charge/current without electron avalanche gain. Daly and SEM detectors first create secondary carriers, multiply them, then apply pulse decisions. A missed initial conversion cannot be restored by higher downstream gain.'),para('<b>Daly:</b> light transfers the signal out of vacuum into the PMT. Scintillation and photocathode efficiency enter before the electron multiplier. <b>SEM:</b> direct ion impact and the early dynodes influence mass-dependent efficiency and aging. In both, the HV divider establishes stage voltages; it is not the Faraday transimpedance feedback resistor.'),sources([{label:'Daly 1960',url:'https://doi.org/10.1063/1.1716953'},{label:'Hamamatsu PMT handbook',url:'https://www.hamamatsu.com/content/dam/hamamatsu-photonics/sites/documents/99_SALES_LIBRARY/etd/PMT_handbook_v4E.pdf'}]));
  build();refresh();
  return{root,exploder:ex,scale:.45,defaults:{xray:true},camera:{position:[.33,.22,-.25],target:[.09,0,.03]},panel:[intro.el,replay.el,output.el,notes.el],update(dt){if(S.playing){S.phase+=dt*.4;if(S.phase>=1.12){S.phase=0;if(S.step<5){S.step++;showStep();}else{S.step=0;showStep();}}}progress.set(Math.min(1,S.phase));root.updateMatrixWorld(true);const path=paths[S.step].map(o=>root.worldToLocal(o.getWorldPosition(new THREE.Vector3())));let lengths=[0];for(let i=1;i<path.length;i++)lengths.push(lengths.at(-1)+path[i].distanceTo(path[i-1]));const total=lengths.at(-1)||1;const isPhoton=S.kind==='daly'&&S.step===2,isIon=S.step===0;status.stage.set(isIon?'Ion':isPhoton?'Photon':S.step===5?'Electrical output':'Secondary electrons');status.progress.set(Math.round(Math.min(1,S.phase)*100)+'%');dots.forEach((p,i)=>{const many=!isIon&&!isPhoton&&S.step>2;const count=isIon?1:isPhoton?8:many?30:5;p.visible=i<count;const u=Math.max(0,Math.min(1,S.phase-i*.006))*total;let k=1;while(k<lengths.length-1&&lengths[k]<u)k++;p.position.copy(path[k-1]).lerp(path[k],(u-lengths[k-1])/(lengths[k]-lengths[k-1]||1));p.position.y+=Math.sin(i*2.4)*(many?.0007:.0003);p.material.color.set(isIon?0xffb24a:isPhoton?0xfff1a6:0x7fe0ff);});},dispose(){chart.dispose();}};
 }
};
