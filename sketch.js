let faceMesh;
let handPose; // Added handPose
let video;
let faces = [];
let hands = []; // Added hands array
let state = "LOCKED";
let openStartTime = 0;
let shards = [];
let aiImages = [];

const THRESHOLD = 12;
const NB_FISSURES = 6;

// Base design dimensions for scaling fonts/strokes
const BASE_W = 960;
const BASE_H = 540;

// Set dynamically
let CANVAS_W, CANVAS_H, SCALE;

// Video source dimensions
const VID_W = 640;
const VID_H = 480;

// ================= HAND GESTURE CONSTANTS =================
const HOLD_FRAMES = 20; 
const COOLDOWN_MS = 1200;
let lastFingerCount = 0;
let fingerHoldFrames = 0;
let lastTriggerTime = 0;

// ================= TEXTES PAR FRAGMENT =================
const SHARD_TEXTS = [
  "The Mapped Life\nI know\nwhere you are.",
  "Public Profile\nYou can\nbe reached.",
  "Sports Record\nNothing\ndisappears.",
  "Search Exposure\nIt starts\nwith a search.",
  "Face Recognition\nYour face\nis enough.",
  "Username Everywhere\nEverything\nis connected."
];

// ================= POINTS FOCAUX PAR IMAGE =================
const FOCAL_POINTS = [
  { x: 0.4,  y: 0.4  },
  { x: 0.51, y: 0.56  },
  { x: 0.6, y: 0.34 },
  { x: 0.62, y: 0.55 },
  { x: 0.55,  y: 0.45 },
  { x: 0.45, y: 0.5  },
];

const IMG_ZOOM = 1.0;

function computeCanvasSize() {
  CANVAS_W = windowWidth;
  CANVAS_H = windowHeight;
  SCALE = min(CANVAS_W / BASE_W, CANVAS_H / BASE_H);
}

function videoCoverScale() { return max(CANVAS_W / VID_W, CANVAS_H / VID_H); }
function videoDisplayW()   { return VID_W * videoCoverScale(); }
function videoDisplayH()   { return VID_H * videoCoverScale(); }
function videoOffsetX()    { return (CANVAS_W - videoDisplayW()) / 2; }
function videoOffsetY()    { return (CANVAS_H - videoDisplayH()) / 2; }

function preload() {
  faceMesh = ml5.faceMesh({ maxFaces: 1, refineLandmarks: true, flipHorizontal: true });
  // HandPose setup for 2 hands (to allow counting to 6)
  handPose = ml5.handPose({ maxHands: 2, flipHorizontal: true });

  for (let i = 0; i < 6; i++) {
    let nom = "fragment3." + (i + 1) + ".png";
    aiImages[i] = loadImage(
      nom,
      () => console.log("Charge : " + nom),
      (err) => console.error("Introuvable : " + nom + " -> " + err)
    );
  }
}

function setup() {
  computeCanvasSize();
  let cnv = createCanvas(CANVAS_W, CANVAS_H);
  cnv.parent('sketch-container');

  video = createCapture(VIDEO);
  video.size(VID_W, VID_H);
  video.hide();

  faceMesh.detectStart(video, gotFaces);
  handPose.detectStart(video, gotHands);
}

function windowResized() {
  computeCanvasSize();
  resizeCanvas(CANVAS_W, CANVAS_H);
  if (state === "FISSURED" && shards.length > 0) {
    createOrganicCracks();
  }
}

function draw() {
  background(15);
  if (faces.length > 0) {
    let face = faces[0];
    if (state === "LOCKED") {
      drawFullScreenVideo();
      checkEyesOpen(face);
    } else {
      updateShardTimers(); // Auto-advance logic
      checkHandGesture(); // Hand logic
      drawFissuredMirror();
    }
  }
}

// ================= AUTO TIMERS =================

function updateShardTimers() {
  let now = millis();
  for (let s of shards) {
    if (s.clickState === 1 && now - s.lastStateChange > 1200) {
      advanceShardState(s);
    } else if (s.clickState === 2 && now - s.lastStateChange > 2500) {
      advanceShardState(s);
    }
  }
}

// ================= HAND GESTURE LOGIC =================

function countFingers(hand) {
  const kp = hand.keypoints;
  const fingerUp = (tip, base) => kp[tip].y < kp[base].y;
  let count = 0;
  let wrist = kp[0];
  if (abs(kp[4].x - wrist.x) > abs(kp[2].x - wrist.x)) count++; // Thumb
  if (fingerUp(8, 5)) count++;  // Index
  if (fingerUp(12, 9)) count++; // Middle
  if (fingerUp(16, 13)) count++; // Ring
  if (fingerUp(20, 17)) count++; // Pinky
  return count;
}

function checkHandGesture() {
  if (hands.length === 0) {
    fingerHoldFrames = 0;
    lastFingerCount = 0;
    return;
  }
  let total = 0;
  for (let h of hands) total += countFingers(h);

  if (total < 1 || total > 6) {
    fingerHoldFrames = 0;
    return;
  }

  if (total === lastFingerCount) {
    fingerHoldFrames++;
  } else {
    lastFingerCount = total;
    fingerHoldFrames = 1;
  }

  if (fingerHoldFrames === HOLD_FRAMES && millis() - lastTriggerTime > COOLDOWN_MS) {
    lastTriggerTime = millis();
    fingerHoldFrames = 0;
    let idx = total - 1;
    if (idx >= 0 && idx < shards.length) advanceShardState(shards[idx]);
  }
}

// ================= FULL-SCREEN VIDEO =================

function drawFullScreenVideo() {
  push();
  translate(CANVAS_W, 0);
  scale(-1, 1);
  image(video, videoOffsetX(), videoOffsetY(), videoDisplayW(), videoDisplayH());
  
  // LIGHT BLACK FILTER
  resetMatrix();
  fill(0, 120); 
  rect(0, 0, CANVAS_W, CANVAS_H);
  pop();

  if (openStartTime > 0) {
    let cx = CANVAS_W / 2;
    let cy = CANVAS_H / 2;
    let prog = map(millis() - openStartTime, 0, 2000, 0, TWO_PI);
    let r = min(CANVAS_W, CANVAS_H) * 0.06;
    push();
    stroke(255, 255, 255, 190);
    strokeWeight(3 * SCALE);
    noFill();
    beginShape();
    for (let a = -HALF_PI; a <= prog - HALF_PI; a += 0.04) {
      vertex(cx + cos(a) * r, cy + sin(a) * r);
    }
    endShape();
    pop();
  }
}

// ================= GENERATION FISSURES =================

function pointOnScreenEdge(angle) {
  let cx = CANVAS_W / 2;
  let cy = CANVAS_H / 2;
  let dx = Math.cos(angle);
  let dy = Math.sin(angle);
  let tx = dx !== 0 ? (dx > 0 ? (CANVAS_W - cx) : -cx) / dx : Infinity;
  let ty = dy !== 0 ? (dy > 0 ? (CANVAS_H - cy) : -cy) / dy : Infinity;
  let t = Math.min(Math.abs(tx), Math.abs(ty));
  return { x: cx + dx * t, y: cy + dy * t };
}

function perimeterSegment(p1, p2) {
  const W = CANVAS_W, H = CANVAS_H;
  const EPS = 1;
  function getWall(p) {
    if (Math.abs(p.y) < EPS) return 0;
    if (Math.abs(p.x - W) < EPS) return 1;
    if (Math.abs(p.y - H) < EPS) return 2;
    if (Math.abs(p.x) < EPS) return 3;
    return -1;
  }
  function perimPos(p) {
    let perim = 2 * (W + H);
    let w = getWall(p);
    if (w === 0) return p.x / perim;
    if (w === 1) return (W + p.y) / perim;
    if (w === 2) return (W + H + (W - p.x)) / perim;
    if (w === 3) return (2 * W + H + (H - p.y)) / perim;
    return 0;
  }
  const corners = [{ x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }, { x: 0, y: 0 }];
  let pos1 = perimPos(p1);
  let pos2 = perimPos(p2);
  if (pos2 <= pos1) pos2 += 1;
  let pts = [];
  for (let c of corners) {
    let cp = perimPos(c);
    if (cp <= pos1) cp += 1;
    if (cp > pos1 && cp < pos2) pts.push(c);
  }
  pts.sort((a, b) => {
    let pa = perimPos(a); if (pa <= pos1) pa += 1;
    let pb = perimPos(b); if (pb <= pos1) pb += 1;
    return pa - pb;
  });
  pts.push(p2);
  return pts;
}

function createOrganicCracks() {
  state = "FISSURED";
  shards = [];
  let centerX = CANVAS_W / 2;
  let centerY = CANVAS_H / 2;
  let angles = [];
  for (let i = 0; i < NB_FISSURES; i++) {
    angles.push(map(i, 0, NB_FISSURES, 0, TWO_PI) + random(-0.1, 0.1));
  }
  let edgePts = angles.map(a => pointOnScreenEdge(a));
  let spokes = [];
  for (let i = 0; i < angles.length; i++) {
    spokes.push(generateJaggedSpoke(centerX, centerY, angles[i], edgePts[i]));
  }
  for (let i = 0; i < spokes.length; i++) {
    let currentSpoke = spokes[i];
    let nextSpoke = spokes[(i + 1) % spokes.length];
    let edgePt1 = edgePts[i];
    let edgePt2 = edgePts[(i + 1) % edgePts.length];
    let shardPoints = [];
    shardPoints.push({ x: centerX, y: centerY });
    for (let p of currentSpoke) shardPoints.push(p);
    let perimPts = perimeterSegment(edgePt1, edgePt2);
    for (let p of perimPts) shardPoints.push(p);
    for (let j = nextSpoke.length - 1; j >= 0; j--) shardPoints.push(nextSpoke[j]);
    let centroid = calculateCentroid(shardPoints);
    shards.push({
      points: shardPoints,
      id: i + 1,
      clickState: 0,
      lastStateChange: 0,
      angle: 0,   targetAngle: 0,
      scale: 1,   targetScale: 1,
      offsetX: 0, targetOffsetX: 0,
      offsetY: 0, targetOffsetY: 0,
      img: aiImages[i % aiImages.length],
      focal: FOCAL_POINTS[i] || { x: 0.5, y: 0.5 },
      center: centroid,
      text: SHARD_TEXTS[i] || ""
    });
  }
}

function generateJaggedSpoke(x, y, angle, edgePt) {
  let pts = [];
  let steps = 6;
  for (let i = 1; i <= steps; i++) {
    let t = i / steps;
    let baseX = lerp(x, edgePt.x, t);
    let baseY = lerp(y, edgePt.y, t);
    let jitter = (i < steps) ? random(-8 * SCALE, 8 * SCALE) : 0;
    pts.push({ x: baseX + (-Math.sin(angle) * jitter), y: baseY + (Math.cos(angle) * jitter) });
  }
  return pts;
}

// ================= DESSIN =================

function drawFissuredMirror() {
  for (let s of shards.filter(s => s.clickState !== 1)) drawShard(s);
  for (let s of shards.filter(s => s.clickState === 1)) drawShard(s);
}

function drawShard(s) {
  s.angle   = lerp(s.angle,   s.targetAngle,   0.1);
  s.scale   = lerp(s.scale,   s.targetScale,   0.08);
  s.offsetX = lerp(s.offsetX, s.targetOffsetX, 0.08);
  s.offsetY = lerp(s.offsetY, s.targetOffsetY, 0.08);

  let cx = s.center.x;
  let cy = s.center.y;
  let tPts = s.points.map(p => ({
    x: (p.x - cx) * s.scale + cx + s.offsetX,
    y: (p.y - cy) * s.scale + cy + s.offsetY
  }));

  let tcx = cx + s.offsetX;
  let tcy = cy + s.offsetY;
  let xs = tPts.map(p => p.x), ys = tPts.map(p => p.y);
  let bx0 = min(xs), bx1 = max(xs), by0 = min(ys), by1 = max(ys);
  let bw = bx1 - bx0, bh = by1 - by0;

  push();
  drawingContext.save();
  beginShape();
  for (let p of tPts) vertex(p.x, p.y);
  endShape(CLOSE);
  drawingContext.clip();

  translate(tcx, tcy);
  scale(cos(s.angle), 1);
  translate(-tcx, -tcy);

  if (abs(s.angle) < HALF_PI) {
    push();
    translate(tcx, tcy); scale(s.scale); translate(-tcx, -tcy);
    translate(CANVAS_W, 0); scale(-1, 1);
    image(video, videoOffsetX(), videoOffsetY(), videoDisplayW(), videoDisplayH());
    
    // LIGHT BLACK FILTER (on shard video)
    resetMatrix();
    fill(0, 120);
    beginShape();
    for (let p of tPts) vertex(p.x, p.y);
    endShape(CLOSE);
    pop();

    push();
    fill(255, 200); noStroke(); textAlign(CENTER, CENTER);
    textSize(14 * SCALE); textStyle(NORMAL);
    let centroid = calculateCentroid(tPts);
    text(s.text, centroid.x, centroid.y);
    pop();
  } else {
    push();
    translate(tcx, tcy); scale(-1, 1); translate(-tcx, -tcy);
    if (s.img && s.img.width > 0) {
      let sc = max(bw / s.img.width, bh / s.img.height) * IMG_ZOOM;
      let iw = s.img.width * sc, ih = s.img.height * sc;
      let ix = constrain(tcx - s.focal.x * iw, tcx - s.focal.x * iw, bx1 - iw + (iw - s.focal.x * iw));
      let iy = constrain(tcy - s.focal.y * ih, tcy - s.focal.y * ih, by1 - ih + (ih - s.focal.y * ih));
      image(s.img, ix, iy, iw, ih);
    }
    pop();
  }
  drawingContext.restore();
  noFill(); stroke(255, 110); strokeWeight(1.5);
  beginShape();
  for (let p of tPts) vertex(p.x, p.y);
  endShape(CLOSE);
  pop();
}

// ================= LOGIQUE YEUX =================

function checkEyesOpen(face) {
  let l = face.keypoints[159], lb = face.keypoints[145];
  let r = face.keypoints[386], rb = face.keypoints[374];
  let d = (dist(l.x,l.y,lb.x,lb.y) + dist(r.x,r.y,rb.x,rb.y)) / 2;
  if (d > THRESHOLD) {
    if (openStartTime === 0) openStartTime = millis();
    if (millis() - openStartTime > 2000) createOrganicCracks();
  } else { openStartTime = 0; }
}

// ================= SOURIS =================

function mousePressed() {
  if (state !== "FISSURED") return;
  let clicked = null;
  for (let s of shards.filter(s => s.clickState === 1)) {
    if (isPointInPoly(getTransformedPoints(s), mouseX, mouseY)) { clicked = s; break; }
  }
  if (!clicked) {
    for (let s of shards.filter(s => s.clickState !== 1)) {
      if (isPointInPoly(getTransformedPoints(s), mouseX, mouseY)) { clicked = s; break; }
    }
  }
  if (clicked) advanceShardState(clicked);
}

function getTransformedPoints(s) {
  let cx = s.center.x, cy = s.center.y;
  return s.points.map(p => ({
    x: (p.x - cx) * s.scale + cx + s.offsetX,
    y: (p.y - cy) * s.scale + cy + s.offsetY
  }));
}

function advanceShardState(s) {
  s.clickState = (s.clickState + 1) % 3;
  s.lastStateChange = millis(); // Track time for auto-unzoom
  if (s.clickState === 0) {
    s.targetAngle = 0; s.targetScale = 1;
    s.targetOffsetX = 0; s.targetOffsetY = 0;
  } else if (s.clickState === 1) {
    s.targetAngle = PI; s.targetScale = 1.65;
    s.targetOffsetX = (CANVAS_W/2 - s.center.x) * 0.25;
    s.targetOffsetY = (CANVAS_H/2 - s.center.y) * 0.25;
  } else {
    s.targetAngle = PI; s.targetScale = 1;
    s.targetOffsetX = 0; s.targetOffsetY = 0;
  }
}

// ================= UTILITAIRES =================

function calculateCentroid(pts) {
  let x = 0, y = 0;
  for (let p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

function isPointInPoly(poly, px, py) {
  let collision = false;
  for (let i = 0; i < poly.length; i++) {
    let vc = poly[i], vn = poly[(i+1) % poly.length];
    if (((vc.y >= py && vn.y < py) || (vc.y < py && vn.y >= py)) &&
        (px < (vn.x - vc.x) * (py - vc.y) / (vn.y - vc.y) + vc.x))
      collision = !collision;
  }
  return collision;
}

function gotFaces(results) { faces = results; }
function gotHands(results) { hands = results; }