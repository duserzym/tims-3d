// A conventional ideal electrometer TIA and an integrate/reset charge amplifier.
// This is a teaching circuit, not the proprietary ATONA charge-management design.
export function resistiveStep(current, R, C, seconds, initial = 0) {
  const target = -current * R;
  return target + (initial - target) * Math.exp(-Math.max(0, seconds) / (R * C));
}
export const capacitiveRamp = (current, C, seconds, initial = 0) => initial - current * seconds / C;
export const currentFromSlope = (deltaV, C, interval) => -C * deltaV / interval;
export function amplifierTrace({kind='resistor', current=1e-13,R=1e12,C=1e-12,window=2,reset=.2,rail=10,dt=.01,duration=8}={}) {
  const t=[],v=[],input=[],q=[],resetting=[],feedbackR=[],feedbackC=[];
  let voltage=0;
  for(let i=0;i<=Math.round(duration/dt);i++){
    const time=i*dt, I=time>=1&&time<5?current:0;
    const cycle=Math.floor((time+1e-10)/(window+reset));
    const isReset=kind==='capacitor'&&time-cycle*(window+reset)>=window-1e-10;
    if(kind==='capacitor'){
      // Exact overlap of this integration window with the 1–5 s beam pulse.
      const elapsed=Math.max(0,Math.min(time,5)-Math.max(cycle*(window+reset),1));
      voltage=isReset?0:capacitiveRamp(current,C,elapsed);
    }else if(i){
      const previous=(i-1)*dt;
      const edges=[previous,...[1,5].filter(t=>t>previous&&t<time),time];
      for(let k=1;k<edges.length;k++){
        const middle=(edges[k-1]+edges[k])/2;
        voltage=resistiveStep(middle>=1&&middle<5?current:0,R,C,edges[k]-edges[k-1],voltage);
        voltage=Math.max(-rail,Math.min(rail,voltage));
      }
    }
    voltage=Math.max(-rail,Math.min(rail,voltage));
    const ir=kind==='resistor'?-voltage/R:0;
    t.push(time);v.push(voltage);input.push(I);q.push(-C*voltage);resetting.push(isReset);feedbackR.push(ir);feedbackC.push(I-ir);
  }
  return {t,v,input,q,resetting,feedbackR,feedbackC};
}
export function discriminatorEvents(arrivals, amplitudes, threshold=.4, deadTime=20) {
  let ready=-Infinity;
  return arrivals.map((time,i)=>{const above=amplitudes[i]>=threshold;const accepted=above&&time>=ready;if(accepted)ready=time+deadTime;return{time,amplitude:amplitudes[i],accepted,reason:!above?'Below threshold':accepted?'Counted':'Inside dead time'};});
}
export function pulseWaveform(t, arrivals, amplitudes, sigma=2) {
  return arrivals.reduce((sum,a,i)=>sum+amplitudes[i]*Math.exp(-.5*((t-a)/sigma)**2),0);
}
