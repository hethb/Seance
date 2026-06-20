// Séance frontend. Plain ES module, no build step — keeps the hackathon loop fast.
// Flow: getUserMedia → capture frame → /api/awaken → render character →
// hold-to-talk records audio → /api/converse → play the reply.

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("canvas");
const player = $("player");

let stream = null;
let current = null; // { objectKey, voiceModel }
let mediaRecorder = null;
let chunks = [];

// ── Camera ───────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: true, // requested up front so hold-to-talk works without a 2nd prompt
    });
    video.srcObject = stream;
  } catch (err) {
    $("hint").textContent = "Camera/mic blocked. Check browser permissions and reload.";
    console.error(err);
  }
}

function captureFrame() {
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 960;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

// ── Awaken ───────────────────────────────────────────────────────────────────
$("awaken-btn").addEventListener("click", async () => {
  const btn = $("awaken-btn");
  btn.disabled = true;
  btn.textContent = "Channeling…";
  try {
    const image = captureFrame();
    const res = await fetch("/api/awaken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "awaken failed");
    showCharacter(data);
  } catch (err) {
    alert("Couldn't awaken it: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Awaken what I'm pointing at";
  }
});

function showCharacter({ persona, portraitUrl, encounters, returning }) {
  current = { objectKey: persona.objectKey, voiceModel: persona.voiceModel };
  $("portrait").src = portraitUrl;
  $("portrait").classList.toggle("stylize", portraitUrl.startsWith("data:")); // mock photo → CSS spirit FX
  $("char-name").textContent = persona.name;
  $("char-tagline").textContent = persona.tagline;
  $("encounter-note").textContent = returning
    ? `✨ It remembers you — encounter #${encounters}.`
    : "";
  $("transcript").innerHTML = "";
  addLine("assistant", persona.backstory, persona.voiceModel); // it introduces itself
  $("camera-stage").hidden = true;
  $("character-stage").hidden = false;
}

// ── Conversation ─────────────────────────────────────────────────────────────
function addLine(role, text, voiceModel) {
  const div = document.createElement("div");
  div.className = `line ${role}`;
  div.textContent = text;
  $("transcript").append(div);
  $("transcript").scrollTop = $("transcript").scrollHeight;
  if (role === "assistant") speak(text, voiceModel);
}

async function send({ audioBlob, text }) {
  const form = new FormData();
  form.append("objectKey", current.objectKey);
  if (text) form.append("text", text);
  if (audioBlob) form.append("audio", audioBlob, "speech.webm");

  setSpeaking(true);
  try {
    const res = await fetch("/api/converse", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "converse failed");
    if (data.userText) addLine("user", data.userText, null);
    playReply(data);
  } catch (err) {
    alert("Conversation error: " + err.message);
  } finally {
    setSpeaking(false);
  }
}

function playReply(data) {
  const div = document.createElement("div");
  div.className = "line assistant";
  div.textContent = data.replyText;
  $("transcript").append(div);
  $("transcript").scrollTop = $("transcript").scrollHeight;

  if (data.audio) {
    // Deepgram TTS audio (base64 mp3)
    player.src = `data:audio/mpeg;base64,${data.audio}`;
    setSpeaking(true);
    player.onended = () => setSpeaking(false);
    player.play().catch(() => setSpeaking(false));
  } else {
    // No Deepgram key → browser speech synthesis so it still talks
    speak(data.replyText, data.voiceModel);
  }
}

// Browser TTS fallback (used in mock mode)
function speak(text, _voiceModel) {
  if (!("speechSynthesis" in window) || player.src) return;
  const u = new SpeechSynthesisUtterance(text);
  u.onstart = () => setSpeaking(true);
  u.onend = () => setSpeaking(false);
  window.speechSynthesis.speak(u);
}

function setSpeaking(on) {
  $("speaking-ring").classList.toggle("active", on);
}

// ── Hold to talk (record audio) ──────────────────────────────────────────────
const talkBtn = $("talk-btn");
function startRecording() {
  if (!stream) return;
  chunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    if (blob.size > 0) send({ audioBlob: blob });
  };
  mediaRecorder.start();
  talkBtn.classList.add("recording");
  talkBtn.textContent = "Listening…";
}
function stopRecording() {
  if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  talkBtn.classList.remove("recording");
  talkBtn.textContent = "Hold to talk";
}
talkBtn.addEventListener("mousedown", startRecording);
talkBtn.addEventListener("mouseup", stopRecording);
talkBtn.addEventListener("mouseleave", stopRecording);
talkBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startRecording(); });
talkBtn.addEventListener("touchend", (e) => { e.preventDefault(); stopRecording(); });

// Type-to-it fallback
$("text-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("text-input");
  if (input.value.trim()) {
    send({ text: input.value.trim() });
    input.value = "";
  }
});

$("reset-btn").addEventListener("click", () => {
  window.speechSynthesis?.cancel();
  player.pause();
  $("character-stage").hidden = true;
  $("camera-stage").hidden = false;
});

startCamera();
