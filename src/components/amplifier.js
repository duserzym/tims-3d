import * as THREE from 'three';
import { M } from '../core/materials.js';
import { mesh, roundedBox, rod, wire } from '../core/geom.js';
import { part } from './parts.js';
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
export function buildAmplifier() {
 const group=new THREE.Group(),parts=[],features={};
 function box(size,pos,mat,name){const m=mesh(roundedBox(...size,.005),mat,{name});m.position.set(...pos);group.add(m);return m;}
 function add(o,off,name,info,extra={}){parts.push(part(o,off,name,info,extra));return o;}
 const board=box([1.16,.025,.76],[0,.015,0],M.pcb(),'Guarded electrometer board');add(board,[0,-.18,0],'Guarded electrometer board','A clean, high-resistance input path and driven guards reduce leakage. All dimensions here are magnified for teaching.',{order:.1});
 const input=box([.07,.09,.07],[-.46,.09,0],M.gold(),'Cup feedthrough');add(input,[-.16,.04,0],'Cup feedthrough','The Faraday cup supplies a tiny conventional current to the summing node. The electrometer input draws very little current; negative feedback carries nearly all of the signal through the feedback network.',{order:.35});features.input=input;
 const node=mesh(new THREE.SphereGeometry(.016,20,14),M.gold());node.position.set(-.23,.10,0);group.add(node);add(node,[0,.07,0],'Summing node · virtual ground','The op-amp changes its output so the inverting input remains near the reference voltage. Virtual ground is maintained by feedback; it is not a direct physical connection to ground.',{order:.5});features.node=node;
 const op=box([.18,.055,.18],[0,.09,.06],M.black(),'Electrometer op-amp');add(op,[0,.18,.04],'Electrometer op-amp','A high open-loop gain senses the tiny difference between its inputs. The output supplies feedback current from the power rails; signal charge does not multiply inside the feedback resistor or capacitor.',{order:.55});features.op=op;
 for(let i=0;i<8;i++){const pin=box([.012,.01,.035],[i<4?-.10:.10,.065,.01+(i%4)*.03],M.steel(),'Op-amp pin');add(pin,[0,.18,.04],'Op-amp connection','Input, output and supply pins are schematic.',{order:.55});}
 const output=box([.055,.07,.07],[.44,.08,0],M.gold(),'Output terminal');add(output,[.12,.04,0],'Voltage output','The digitizer measures Vout. Resistor readout uses I = −Vout/R after settling. Capacitive readout uses Iavg = −CΔV/Δt within an integration window.',{order:.7});features.output=output;
 const adc=box([.12,.04,.13],[.43,.08,.24],M.black(),'ADC');add(adc,[.13,.12,.12],'ADC & digital current estimate','A sampled voltage becomes an estimate of current using calibrated R, or calibrated C and elapsed time. Baseline, gain and timing errors matter.',{order:.8});features.adc=adc;
 const resistor=new THREE.Group();group.add(resistor);resistor.position.set(0,.12,-.22);
 const glass=mesh(new THREE.CylinderGeometry(.034,.034,.25,32),M.glass());glass.rotation.z=Math.PI/2;resistor.add(glass);add(glass,[0,.08,-.05],'Resistor glass envelope','The envelope shields and insulates the resistive element. The resistor is a passive feedback element; the powered op-amp supplies the output energy.',{order:.5,shell:true});
 const film=mesh(new THREE.CylinderGeometry(.022,.022,.22,24),M.resistorBody());film.rotation.z=Math.PI/2;resistor.add(film);
 for(const s of [-1,1])resistor.add(rod(V(s*.125,0,0),V(s*.22,0,0),.004,M.copper()));
 add(resistor,[0,.20,-.12],'High-ohmic feedback resistor','Vout = −IR at steady state. Feedback current flows through the resistive film; thermal agitation adds Johnson noise. In parallel with Cf it gives a simple signal time constant τ = RC.',{order:.65});features.resistor=resistor;
 const capacitor=new THREE.Group();group.add(capacitor);capacitor.position.set(0,.12,.28);
 const plates=[];
 for(const s of [-1,1]){const p=mesh(roundedBox(.008,.10,.12,.001),M.copper());p.position.x=s*.025;capacitor.add(p);plates.push(p);add(p,[s*.04,.03,0],s<0?'Input-side capacitor plate':'Output-side capacitor plate','Charge accumulates on this conductor. Its partner plate holds equal and opposite charge; the dielectric between them is an insulator.',{order:.75});}
 const dielectric=mesh(roundedBox(.04,.085,.10,.003),new THREE.MeshPhysicalMaterial({color:0xb4e4fa,transparent:true,opacity:.35,roughness:.3}));capacitor.add(dielectric);add(dielectric,[0,.10,0],'Capacitor dielectric','An insulating material separates the plates. An electric field stores energy; the ideal capacitor does not conduct charge through this layer.',{order:.7});
 add(capacitor,[0,.23,.16],'Feedback capacitor · two plates & dielectric','Equal and opposite charges accumulate on conducting plates. Ideal electrons do not cross the dielectric. V = Q/C; the output changes at dV/dt = −I/C. In resistor mode, Cf limits response speed; in capacitive mode it is the measuring element.',{order:.65});features.capacitor=capacitor;features.plates=plates;
 const charges=[];for(let i=0;i<24;i++){const dot=mesh(new THREE.SphereGeometry(.005,10,8),new THREE.MeshBasicMaterial({color:i<12?0x5ab0ff:0xffb24a}));dot.position.set(i<12?-.031:.031,((i%12)%4-1.5)*.022,(Math.floor((i%12)/4)-1)*.03);plates[i<12?0:1].add(dot);dot.position.x=i<12?-.006:.006;charges.push(dot);}features.charges=charges;
 const sw=new THREE.Group();group.add(sw);sw.position.set(.06,.13,.44);
 const lever=rod(V(-.04,0,0),V(.04,0,0),.005,M.gold());sw.add(lever);add(sw,[.12,.16,.13],'Reset switch','In this conventional teaching integrator the switch periodically discharges the feedback capacitor. Data during reset are invalid. ATONA uses more elaborate active charge management; this reset circuit is not its proprietary implementation.',{order:.7});features.switch=sw;features.lever=lever;
 const traces=new THREE.Group();group.add(traces);
 const routes=[ [V(-.46,.10,0),V(-.23,.10,0),V(-.10,.10,0)], [V(.10,.10,0),V(.44,.10,0)], [V(-.23,.10,0),V(-.23,.12,-.22),V(-.22,.12,-.22)], [V(.22,.12,-.22),V(.31,.12,-.22),V(.31,.10,0)], [V(-.23,.10,0),V(-.23,.12,.28),V(-.025,.12,.28)], [V(.025,.12,.28),V(.31,.12,.28),V(.31,.10,0)], [V(.44,.10,0),V(.44,.10,.24)] ];
 const resistorTraces=new THREE.Group();traces.add(resistorTraces);features.resistorTraces=resistorTraces;
 for(const [i,path] of routes.entries())(i===2||i===3?resistorTraces:traces).add(wire(path,.003,M.gold()));add(traces,[0,.04,0],'Feedback connections','Input, Rf and Cf share the summing node; the feedback elements return from the output. In capacitive mode the resistor branch is removed. The grounded non-inverting reference is shown separately.',{order:.4});features.traces=traces;
 const resetTraces=new THREE.Group();group.add(resetTraces);features.resetTraces=resetTraces;
 for(const path of [[V(-.025,.12,.28),V(-.16,.12,.44),V(.02,.13,.44)],[V(.10,.13,.44),V(.31,.12,.44),V(.31,.12,.28)]])resetTraces.add(wire(path,.003,M.gold()));
 add(resetTraces,[0,.04,0],'Reset bypass connections','Closing the switch provides a conducting path around the capacitor to discharge it. These connections are separate from the insulated dielectric.',{order:.4});
 traces.add(wire([V(-.1,.08,.13),V(-.16,.08,.16),V(-.16,.055,.16)],.003,M.steel()));
 const ref=box([.08,.012,.065],[-.16,.055,.16],M.steel(),'Reference ground');add(ref,[0,-.08,.05],'Reference ground','The non-inverting input is referenced to ground. The inverting node tracks it only while feedback can keep the amplifier within its linear output range.',{order:.45});
 const cover=box([1.20,.025,.80],[0,.32,0],M.panel(0xb6c1cf),'Amplifier shield');add(cover,[0,.4,-.1],'Shield & temperature-stabilized enclosure','The cover protects the ultra-high-impedance electronics. X-ray or exploded view reveals the resistor, capacitor, op-amp, reset switch and ADC.',{order:0,shell:true});features.cover=cover;
 return{group,parts,features};
}
