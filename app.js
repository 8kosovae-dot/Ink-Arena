const PROMPTS = [
  {title:"The Last Message",text:"You wake up in a world where nobody remembers yesterday. Except you. Write the moment you realize what has happened."},
  {title:"A Door in the Ocean",text:"A door appears at the bottom of the sea. It has your name written on it. What happens when it opens?"},
  {title:"The Borrowed Shadow",text:"One morning, your shadow belongs to someone else. It starts trying to tell you something."},
  {title:"The Unsent Letter",text:"A letter arrives that you wrote twenty years from now. It contains only one warning."},
  {title:"The Quietest Applause",text:"A person performs for an audience that cannot make a sound. Make the scene matter."},
  {title:"The City That Forgot",text:"Every map has erased one city. Its residents insist it has always been there. Tell the story of a visitor."}
];
const $ = id => document.getElementById(id);
const STORE_KEY = "inkArenaPrototype_v1";
const DEFAULT = {rating:1200,wins:0,losses:0,matches:0,history:[]};
let profile = loadProfile();
let currentPrompt = null, timerInterval = null, secondsLeft = 600, battleActive = false, lastStory = "";

function loadProfile(){
  try { return {...DEFAULT,...JSON.parse(localStorage.getItem(STORE_KEY) || "{}")}; }
  catch { return {...DEFAULT}; }
}
function saveProfile(){ localStorage.setItem(STORE_KEY,JSON.stringify(profile)); }
function leagueFor(r){
  if(r>=2400)return "Grandmaster"; if(r>=2000)return "Master"; if(r>=1600)return "Author";
  if(r>=1200)return "Apprentice"; return "Beginner";
}
function renderProfile(){
  $("rating-stat").textContent=profile.rating;
  $("header-rating").textContent=profile.rating+" ELO";
  $("matches-stat").textContent=profile.matches;
  $("winrate-stat").textContent=profile.matches?Math.round(profile.wins/profile.matches*100)+"%":"—";
  $("league-stat").textContent=leagueFor(profile.rating);
  $("you-rating").textContent=profile.rating+" ELO";
  $("you-league").textContent=leagueFor(profile.rating);
  $("leader-rating").textContent=profile.rating;
  $("history-list").innerHTML=profile.history.length?profile.history.slice(0,5).map(m=>
    `<div class="history-item"><span>${m.prompt}</span><b class="${m.won?'won':'lost'}">${m.won?'WIN':'LOSS'} · ${m.change>0?'+':''}${m.change}</b></div>`
  ).join(""):'<p class="empty-history">No battles yet. Your first match is waiting.</p>';
}
function showToast(message){
  const toast=$("toast");toast.textContent=message;toast.classList.add("show");
  setTimeout(()=>toast.classList.remove("show"),2300);
}
function showOnly(id){
  ["battle-card","editor-card","results-card"].forEach(x=>$(x).classList.toggle("hidden",x!==id));
}
function startBattle(){
  currentPrompt=PROMPTS[Math.floor(Math.random()*PROMPTS.length)];
  secondsLeft=600;battleActive=true;lastStory="";
  $("prompt-title").textContent=currentPrompt.title;
  $("prompt-text").textContent=currentPrompt.text;
  $("story-input").value="";updateWordCount();
  $("match-id").textContent="MATCH #"+Math.floor(10000+Math.random()*90000);
  $("opponent-name").textContent=["MossAndInk","PaperFox","QuietComet","BluePencil","NorthOfWords"][Math.floor(Math.random()*5)];
  $("opponent-rating").textContent=(profile.rating+Math.floor(Math.random()*241)-120)+" ELO";
  $("timer").classList.remove("urgent");updateTimer();showOnly("editor-card");
  $("story-input").focus();
  clearInterval(timerInterval);
  timerInterval=setInterval(()=>{
    secondsLeft--;updateTimer();
    if(secondsLeft<=0){clearInterval(timerInterval);finishBattle(true);}
  },1000);
}
function updateTimer(){
  const m=Math.floor(secondsLeft/60),s=secondsLeft%60;
  $("timer").textContent=String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
  if(secondsLeft<=60)$("timer").classList.add("urgent");
}
function wordCount(text){const trimmed=text.trim();return trimmed?trimmed.split(/\s+/).length:0;}
function updateWordCount(){
  const count=wordCount($("story-input").value);
  $("word-count").textContent=count;
  $("submit-btn").disabled=count===0||count>400;
  $("editor-status").textContent=count>400?"Please stay under 400 words.":"Your draft stays in this browser.";
}
function hashText(text){
  let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}
function scoreStory(text){
  const words=wordCount(text),sentences=(text.match(/[.!?]+/g)||[]).length;
  const paragraphs=text.split(/\n\s*\n/).filter(p=>p.trim()).length;
  const variety=new Set(text.toLowerCase().match(/[a-z']+/g)||[]).size;
  const seed=hashText(text);
  const noise=n=>((seed>>>n)%9)-4;
  const lengthScore=Math.min(20,Math.round(words/14));
  const sentenceScore=Math.min(20,Math.round(sentences/2)+8);
  const varietyScore=Math.min(20,Math.round(variety/5));
  const structureScore=Math.min(20,10+paragraphs*2+noise(4));
  const craftScore=Math.min(20,12+noise(8)+Math.round(variety/30));
  const scores=[
    ["Creativity",clamp(11+noise(0)+Math.round(variety/35),5,20)],
    ["Prose & imagery",clamp(craftScore,5,20)],
    ["Story structure",clamp(structureScore,5,20)],
    ["Character & emotion",clamp(10+noise(12)+Math.min(6,sentences/3),5,20)],
    ["Clarity & control",clamp(Math.round((lengthScore+sentenceScore+varietyScore)/3)+noise(16),5,20)]
  ];
  return {scores,total:scores.reduce((a,x)=>a+x[1],0)};
}
function clamp(n,min,max){return Math.max(min,Math.min(max,Math.round(n)));}
function finishBattle(timedOut=false){
  if(!battleActive)return;
  battleActive=false;clearInterval(timerInterval);
  const story=$("story-input").value.trim();lastStory=story;
  const own=scoreStory(story);
  const opponentScore=clamp(65+Math.floor(Math.random()*29),50,96);
  const won=own.total>=opponentScore;
  const change=won?16: -12;
  profile.rating=Math.max(100,profile.rating+change);
  profile.matches++;if(won)profile.wins++;else profile.losses++;
  profile.history.unshift({prompt:currentPrompt.title,won,change});
  saveProfile();renderProfile();
  $("your-score").textContent=own.total+"/100";
  $("their-score").textContent=opponentScore+"/100";
  $("result-title").textContent=won?"Victory in the arena.":"A lesson for the next round.";
  $("result-subtitle").textContent=timedOut?"Time ran out. Your draft was submitted automatically.":"Your practice match has been evaluated.";
  $("rating-change").textContent=(change>0?"+":"")+change+" ELO";
  $("rating-change").style.color=won?"var(--green)":"var(--red)";
  $("score-breakdown").innerHTML=own.scores.map(([label,value])=>
    `<div class="breakdown-row"><span>${label}</span><div class="bar"><span style="width:${value*5}%"></span></div><b>${value}/20</b></div>`
  ).join("");
  $("judge-feedback").textContent=makeFeedback(story,own);
  $("review-story").textContent=story||"No story was submitted.";
  $("review-story").classList.add("hidden");
  $("read-again-btn").textContent="Review my story";
  showOnly("results-card");
  showToast(won?"You won the practice match!":"Match complete — keep writing.");
}
function makeFeedback(story,result){
  const words=wordCount(story);
  if(!words)return "You did not submit a story, so this round is a loss. Try again with a clear beginning, a meaningful change, and a deliberate ending.";
  const notes=[];
  if(words<80)notes.push("The piece is very short; consider giving its central moment more room to develop.");
  else if(words>300)notes.push("You used the available space well. Check that every paragraph advances the scene.");
  else notes.push("The length is manageable. Consider whether the central conflict has enough room to develop.");
  if((story.match(/[.!?]+/g)||[]).length<4)notes.push("Vary sentence length and give important moments room to land.");
  else notes.push("You have a clear sequence of sentences. Look for one place where a concrete sensory detail could make the scene more vivid.");
  if(story.split(/\n\s*\n/).filter(x=>x.trim()).length<2)notes.push("Paragraph breaks can help control pacing and make shifts in action easier to follow.");
  notes.push("These are sample rule-based notes, not an actual AI literary evaluation.");
  return notes.join(" ");
}
function cancelBattle(){
  battleActive=false;clearInterval(timerInterval);showOnly("battle-card");showToast("Practice match abandoned.");
}
$("start-btn").addEventListener("click",startBattle);
$("story-input").addEventListener("input",updateWordCount);
$("submit-btn").addEventListener("click",()=>finishBattle(false));
$("cancel-btn").addEventListener("click",cancelBattle);
$("again-btn").addEventListener("click",()=>{showOnly("battle-card");startBattle();});
$("read-again-btn").addEventListener("click",()=>{
  const box=$("review-story");box.classList.toggle("hidden");
  $("read-again-btn").textContent=box.classList.contains("hidden")?"Review my story":"Hide my story";
});
renderProfile();
