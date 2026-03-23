let faceMesh;
let video;
let faces = [];
let state = "LOCKED";
let openStartTime = 0;
let shards = [];
let aiImages = [];

const THRESHOLD = 12;
const NB_FISSURES = 6;

// Canvas élargi pour laisser de la place au texte sur les côtés
const CANVAS_W = 960;
const CANVAS_H = 540;

// Miroir centré dans le canvas
const MIRROR_RX = 170;
const MIRROR_RY = 220;

// Zone réservée au texte de chaque côté du miroir
const TEXT_ZONE_WIDTH = 180; // espace disponible à gauche et à droite

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
  { x: 0.5,  y: 0.5  },
  { x: 0.51, y: 0.6  },
  { x: 0.38, y: 0.39 },
  { x: 0.25, y: 0.49 },
  { x: 0.5,  y: 0.48 },
  { x: 0.58, y: 0.5  },
];

const IMG_ZOOM = 1.0;

function preload() {
  faceMesh = ml5.faceMesh({ maxFaces: 1, refineLandmarks: true, flipHorizontal: true });

  for (let i = 0; i < 6; i++) {
    let nom = "fragment3." + (i + 1) + ".png";
    aiImages[i] = loadImage(
      nom,
      () => console.log("✅ Chargé : " + nom),
      (err) => console.error("❌ Introuvable : " + nom + " → " + err)
    );
  }
}

function setup() {
  createCanvas(CANVAS_W, CANVAS_H);
  // La webcam reste en 640×480, on l'affiche centrée dans le canvas
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();
  faceMesh.detectStart(video, gotFaces);
}

// Offset pour centrer la vidéo 640×480 dans le canvas 960×540
function videoOffsetX() { return (CANVAS_W - 640) / 2; }
function videoOffsetY() { return (CANVAS_H - 480) / 2; }

function draw() {
  background(15);
  if (faces.length > 0) {
    let face = faces[0];
    if (state === "LOCKED") {
      drawIntactMirror();
      checkEyesOpen(face);
    } else {
      drawFissuredMirror();
    }
  }
}

// ================= GÉNÉRATION FISSURES SUR ELLIPSE =================

function pointOnEllipse(angle) {
  return {
    x: CANVAS_W / 2 + cos(angle) * MIRROR_RX,
    y: CANVAS_H / 2 + sin(angle) * MIRROR_RY
  };
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

  let spokes = [];
  for (let a of angles) {
    spokes.push(generateJaggedLineToEllipse(centerX, centerY, a));
  }

  for (let i = 0; i < spokes.length; i++) {
    let currentSpoke = spokes[i];
    let nextSpoke = spokes[(i + 1) % spokes.length];

    let shardPoints = [];
    shardPoints.push({ x: centerX, y: centerY });
    for (let p of currentSpoke) shardPoints.push(p);

    let a1 = angles[i];
    let a2 = angles[(i + 1) % angles.length];
    if (a2 < a1) a2 += TWO_PI;
    for (let step = 1; step <= 10; step++) {
      let a = map(step, 0, 10, a1, a2);
      shardPoints.push(pointOnEllipse(a));
    }

    for (let j = nextSpoke.length - 1; j >= 0; j--) {
      shardPoints.push(nextSpoke[j]);
    }

    let centroid = calculateCentroid(shardPoints);

    shards.push({
      points: shardPoints,
      id: i + 1,
      clickState: 0,
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

function generateJaggedLineToEllipse(x, y, angle) {
  let edgePt = pointOnEllipse(angle);
  let pts = [];
  let steps = 6;
  for (let i = 1; i <= steps; i++) {
    let t = i / steps;
    let baseX = lerp(x, edgePt.x, t);
    let baseY = lerp(y, edgePt.y, t);
    let jitter = (i < steps) ? random(-8, 8) : 0;
    pts.push({ x: baseX + (-sin(angle) * jitter), y: baseY + (cos(angle) * jitter) });
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

  let xs = tPts.map(p => p.x);
  let ys = tPts.map(p => p.y);
  let bx0 = min(xs), bx1 = max(xs);
  let by0 = min(ys), by1 = max(ys);
  let bw = bx1 - bx0;
  let bh = by1 - by0;

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
    // Face miroir — vidéo offsettée pour couvrir le miroir centré
    push();
    translate(tcx, tcy);
    scale(s.scale);
    translate(-tcx, -tcy);
    // Flip horizontal autour du centre du canvas
    translate(CANVAS_W, 0);
    scale(-1, 1);
    image(video, videoOffsetX(), videoOffsetY(), 640, 480);
    pop();

  } else {
    // Face IA avec point focal
    push();
    translate(tcx, tcy);
    scale(-1, 1);
    translate(-tcx, -tcy);

    if (s.img && s.img.width > 0) {
      let sc = max(bw / s.img.width, bh / s.img.height) * IMG_ZOOM;
      let iw = s.img.width  * sc;
      let ih = s.img.height * sc;

      let focalPixelX = s.focal.x * iw;
      let focalPixelY = s.focal.y * ih;

      let ix = tcx - focalPixelX;
      let iy = tcy - focalPixelY;

      ix = constrain(ix, tcx - focalPixelX, bx1 - iw + (iw - focalPixelX));
      iy = constrain(iy, tcy - focalPixelY, by1 - ih + (ih - focalPixelY));

      image(s.img, ix, iy, iw, ih);
    }
    pop();
  }

  drawingContext.restore();

  noFill();
  stroke(255, 110);
  strokeWeight(1.5);
  beginShape();
  for (let p of tPts) vertex(p.x, p.y);
  endShape(CLOSE);

  pop();

  if (s.clickState === 1 && abs(s.angle) > HALF_PI) {
    drawShardText(s, tPts, tcx, tcy);
  }
}

function drawShardText(s, tPts, tcx, tcy) {
  let onRight = tcx >= CANVAS_W / 2;

  // Angle sur l'ellipse vers le côté gauche ou droit
  let edgeAngle = onRight ? 0 : PI;
  // Légère correction verticale pour suivre la courbure
  let dy = tcy - CANVAS_H / 2;
  edgeAngle += (dy / MIRROR_RY) * 0.45;

  // Point d'accroche sur le bord de l'ellipse
  let edgeX = CANVAS_W / 2 + cos(edgeAngle) * (MIRROR_RX + 14);
  let edgeY = CANVAS_H / 2 + sin(edgeAngle) * (MIRROR_RY + 14);

  // Zone de texte : entre le bord du miroir et le bord du canvas
  // Côté droit : de edgeX+gap jusqu'à CANVAS_W - padding
  // Côté gauche : de padding jusqu'à edgeX-gap
  let gap = 24;
  let padding = 18;

  let textX, textW;
  if (onRight) {
    textX = edgeX + gap;
    textW = CANVAS_W - padding - textX;
  } else {
    textX = padding;
    textW = edgeX - gap - textX;
  }

  // Centre vertical de la zone texte : calé sur edgeY, borné dans le canvas
  let textY = constrain(edgeY, 40, CANVAS_H - 40);

  push();
  textFont('Georgia');
  textSize(16);
  textLeading(26);

  // Ligne de liaison du bord de l'ellipse vers la zone texte
  stroke(255, 55);
  strokeWeight(0.8);
  noFill();
  let anchorX = onRight ? textX - 6 : textX + textW + 6;
  // Petite courbe Bezier
  beginShape();
  vertex(edgeX, edgeY);
  quadraticVertex(
    onRight ? edgeX + gap * 0.5 : edgeX - gap * 0.5,
    edgeY,
    anchorX,
    textY
  );
  endShape();

  // Point d'accroche
  noStroke();
  fill(255, 90);
  circle(edgeX, edgeY, 4);

  // Titre (première ligne) en plus grand
  let lines = s.text.split('\n');
  fill(255, 230);
  noStroke();
  textAlign(onRight ? LEFT : RIGHT);
  textSize(15);
  textStyle(ITALIC);
  // Titre
  text(lines[0], onRight ? textX : textX + textW, textY - 10);
  // Corps
  textSize(14);
  textStyle(NORMAL);
  fill(255, 170);
  let bodyText = lines.slice(1).join('\n');
  text(bodyText, onRight ? textX : textX + textW, textY + 14);

  pop();
}

// ================= MIROIR OVALE =================

function drawIntactMirror() {
  push();
  let cx = CANVAS_W / 2;
  let cy = CANVAS_H / 2;

  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.ellipse(cx, cy, MIRROR_RX, MIRROR_RY, 0, 0, TWO_PI);
  drawingContext.clip();
  translate(CANVAS_W, 0);
  scale(-1, 1);
  image(video, videoOffsetX(), videoOffsetY(), 640, 480);
  drawingContext.restore();

  noFill();
  stroke(255, 255, 255, 35); strokeWeight(14);
  arc(cx - 25, cy - 40, MIRROR_RX*2-10, MIRROR_RY*2-10, -PI*0.8, -PI*0.1);
  stroke(255, 210); strokeWeight(7);
  ellipse(cx, cy, MIRROR_RX*2, MIRROR_RY*2);
  stroke(255, 55); strokeWeight(1.5);
  ellipse(cx, cy, MIRROR_RX*2-12, MIRROR_RY*2-12);

  if (openStartTime > 0) {
    let prog = map(millis() - openStartTime, 0, 2000, 0, TWO_PI);
    stroke(255, 255, 255, 190); strokeWeight(3.5); noFill();
    beginShape();
    for (let a = -HALF_PI; a <= prog - HALF_PI; a += 0.04) {
      vertex(cx + cos(a) * (MIRROR_RX+13), cy + sin(a) * (MIRROR_RY+13));
    }
    endShape();
  }
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
  } else {
    openStartTime = 0;
  }
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