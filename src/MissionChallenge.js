// Personal mastery only: never changes online scores or existing unlocks.
export function challengePar(m, start) {
  if(m.points?.length){let previous=start,total=0;for(const p of m.points){total+=Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z);previous=p;}return Math.max(20,total/8+m.points.length*4);}
  return {travel:80,discover:75,technique:25}[m.type]||60;
}
export function assessChallenge(m) {
  const skills=Math.min(4,m.skills?.size||0),par=Math.max(1,m.par||60);
  const pace=Math.max(0,Math.min(1,par/Math.max(1,m.elapsed)));
  const score=Math.round(500+300*pace+50*skills);
  return {score,medal:score>=900?'gold':score>=750?'silver':'bronze',seconds:Math.round(m.elapsed),skills};
}
export function cleanChallenge(record) {
  if(!record||!Number.isInteger(record.score)||record.score<500||record.score>1000||!Number.isInteger(record.seconds)||record.seconds<0||record.seconds>1e9||!Number.isInteger(record.skills)||record.skills<0||record.skills>4)return null;
  return {score:record.score,seconds:record.seconds,skills:record.skills,medal:record.score>=900?'gold':record.score>=750?'silver':'bronze'};
}
