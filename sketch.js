// sketch.js — does NOT auto-start.
// index.html calls window.startSketch() after the user selects a name.
// Images are loaded from:
//   fragment_clara/fragment3.1.png … fragment3.6.png
//   fragment_laura/fragment3.1.png … fragment3.6.png
//   fragment_mariana/fragment3.1.png … fragment3.6.png

window.startSketch = function () {

  new p5(function (p) {

    // ── state ──────────────────────────────────────────────────────────
    let faceMesh, handPose, video;
    let faces = [], hands = [];
    let state = "LOCKED";
    let openStartTime = 0;
    let shards = [], aiImages = [];

    const THRESHOLD   = 12;
    const NB_FISSURES = 6;
    const BASE_W = 960, BASE_H = 540;
    const VID_W  = 640, VID_H  = 480;
    const IMG_ZOOM = 1.0;

    let CANVAS_W, CANVAS_H, SCALE;

    // hand gesture
    const HOLD_FRAMES  = 20;
    const COOLDOWN_MS  = 1200;
    let lastFingerCount = 0, fingerHoldFrames = 0, lastTriggerTime = 0;

    const SHARD_TEXTS = [
      "The Mapped Life\nI know\nwhere you are.",
      "Public Profile\nYou can\nbe reached.",
      "Sports Record\nNothing\ndisappears.",
      "Search Exposure\nIt starts\nwith a search.",
      "Face Recognition\nYour face\nis enough.",
      "Username Everywhere\nEverything\nis connected."
    ];

    const FOCAL_POINTS = [
      { x: 0.4,  y: 0.4  },
      { x: 0.51, y: 0.56 },
      { x: 0.6,  y: 0.34 },
      { x: 0.62, y: 0.55 },
      { x: 0.55, y: 0.45 },
      { x: 0.45, y: 0.5  },
    ];

    // ── helpers ────────────────────────────────────────────────────────
    function computeCanvasSize() {
      CANVAS_W = p.windowWidth;
      CANVAS_H = p.windowHeight;
      SCALE = p.min(CANVAS_W / BASE_W, CANVAS_H / BASE_H);
    }
    function videoCoverScale() { return p.max(CANVAS_W / VID_W, CANVAS_H / VID_H); }
    function videoDisplayW()   { return VID_W * videoCoverScale(); }
    function videoDisplayH()   { return VID_H * videoCoverScale(); }
    function videoOffsetX()    { return (CANVAS_W - videoDisplayW()) / 2; }
    function videoOffsetY()    { return (CANVAS_H - videoDisplayH()) / 2; }

    function imageFolder() {
      const user = window.selectedUser;
      return user ? "fragment_" + user + "/" : "";
    }

    // ── preload ────────────────────────────────────────────────────────
    p.preload = function () {
      faceMesh = ml5.faceMesh({ maxFaces: 1, refineLandmarks: true, flipHorizontal: true });
      handPose = ml5.handPose({ maxHands: 2, flipHorizontal: true });

      const folder = imageFolder();
      for (let i = 0; i < 6; i++) {
        const nom = folder + "fragment3." + (i + 1) + ".png";
        aiImages[i] = p.loadImage(
          nom,
          () => console.log("Loaded: " + nom),
          ()  => console.warn("Not found: " + nom)
        );
      }
    };

    // ── setup ──────────────────────────────────────────────────────────
    p.setup = function () {
      computeCanvasSize();
      const cnv = p.createCanvas(CANVAS_W, CANVAS_H);
      cnv.parent('sketch-container');

      video = p.createCapture(p.VIDEO);
      video.size(VID_W, VID_H);
      video.hide();

      faceMesh.detectStart(video, function (r) { faces = r; });
      handPose.detectStart(video, function (r) { hands = r; });
    };

    // ── windowResized ──────────────────────────────────────────────────
    p.windowResized = function () {
      computeCanvasSize();
      p.resizeCanvas(CANVAS_W, CANVAS_H);
      if (state === "FISSURED" && shards.length > 0) createOrganicCracks();
    };

    // ── draw ───────────────────────────────────────────────────────────
    p.draw = function () {
      p.background(15);
      if (faces.length > 0) {
        const face = faces[0];
        if (state === "LOCKED") {
          drawFullScreenVideo();
          checkEyesOpen(face);
        } else {
          updateShardTimers();
          checkHandGesture();
          drawFissuredMirror();
        }
      }
    };

    // ── auto timers ────────────────────────────────────────────────────
    function updateShardTimers() {
      const now = p.millis();
      for (const s of shards) {
        if      (s.clickState === 1 && now - s.lastStateChange > 1200) advanceShardState(s);
        else if (s.clickState === 2 && now - s.lastStateChange > 2500) advanceShardState(s);
      }
    }

    // ── hand gesture ───────────────────────────────────────────────────
    function countFingers(hand) {
      const kp = hand.keypoints;
      const fingerUp = (tip, base) => kp[tip].y < kp[base].y;
      let count = 0;
      if (p.abs(kp[4].x - kp[0].x) > p.abs(kp[2].x - kp[0].x)) count++;
      if (fingerUp(8,  5))  count++;
      if (fingerUp(12, 9))  count++;
      if (fingerUp(16, 13)) count++;
      if (fingerUp(20, 17)) count++;
      return count;
    }

    function checkHandGesture() {
      if (hands.length === 0) { fingerHoldFrames = 0; lastFingerCount = 0; return; }
      let total = 0;
      for (const h of hands) total += countFingers(h);
      if (total < 1 || total > 6) { fingerHoldFrames = 0; return; }
      if (total === lastFingerCount) { fingerHoldFrames++; }
      else { lastFingerCount = total; fingerHoldFrames = 1; }
      if (fingerHoldFrames === HOLD_FRAMES && p.millis() - lastTriggerTime > COOLDOWN_MS) {
        lastTriggerTime = p.millis();
        fingerHoldFrames = 0;
        const idx = total - 1;
        if (idx >= 0 && idx < shards.length) advanceShardState(shards[idx]);
      }
    }

    // ── full-screen video ──────────────────────────────────────────────
    function drawFullScreenVideo() {
      p.push();
      p.translate(CANVAS_W, 0); p.scale(-1, 1);
      p.image(video, videoOffsetX(), videoOffsetY(), videoDisplayW(), videoDisplayH());
      p.resetMatrix();
      p.fill(0, 120); p.rect(0, 0, CANVAS_W, CANVAS_H);
      p.pop();

      if (openStartTime > 0) {
        const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
        const prog = p.map(p.millis() - openStartTime, 0, 2000, 0, p.TWO_PI);
        const r = p.min(CANVAS_W, CANVAS_H) * 0.06;
        p.push();
        p.stroke(255, 255, 255, 190); p.strokeWeight(3 * SCALE); p.noFill();
        p.beginShape();
        for (let a = -p.HALF_PI; a <= prog - p.HALF_PI; a += 0.04)
          p.vertex(cx + p.cos(a) * r, cy + p.sin(a) * r);
        p.endShape();
        p.pop();
      }
    }

    // ── crack generation ───────────────────────────────────────────────
    function pointOnScreenEdge(angle) {
      const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const tx = dx !== 0 ? (dx > 0 ? (CANVAS_W - cx) : -cx) / dx : Infinity;
      const ty = dy !== 0 ? (dy > 0 ? (CANVAS_H - cy) : -cy) / dy : Infinity;
      const t  = Math.min(Math.abs(tx), Math.abs(ty));
      return { x: cx + dx * t, y: cy + dy * t };
    }

    function perimeterSegment(p1, p2) {
      const W = CANVAS_W, H = CANVAS_H, EPS = 1;
      function getWall(pt) {
        if (Math.abs(pt.y)      < EPS) return 0;
        if (Math.abs(pt.x - W)  < EPS) return 1;
        if (Math.abs(pt.y - H)  < EPS) return 2;
        if (Math.abs(pt.x)      < EPS) return 3;
        return -1;
      }
      function perimPos(pt) {
        const perim = 2 * (W + H), w = getWall(pt);
        if (w === 0) return pt.x / perim;
        if (w === 1) return (W + pt.y) / perim;
        if (w === 2) return (W + H + (W - pt.x)) / perim;
        if (w === 3) return (2 * W + H + (H - pt.y)) / perim;
        return 0;
      }
      const corners = [{ x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }, { x: 0, y: 0 }];
      let pos1 = perimPos(p1), pos2 = perimPos(p2);
      if (pos2 <= pos1) pos2 += 1;
      let pts = corners.filter(c => { let cp = perimPos(c); if (cp <= pos1) cp += 1; return cp > pos1 && cp < pos2; });
      pts.sort((a, b) => { let pa = perimPos(a), pb = perimPos(b); if (pa <= pos1) pa += 1; if (pb <= pos1) pb += 1; return pa - pb; });
      pts.push(p2);
      return pts;
    }

    function createOrganicCracks() {
      state = "FISSURED"; shards = [];
      const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
      const angles = [];
      for (let i = 0; i < NB_FISSURES; i++)
        angles.push(p.map(i, 0, NB_FISSURES, 0, p.TWO_PI) + p.random(-0.1, 0.1));
      const edgePts = angles.map(a => pointOnScreenEdge(a));
      const spokes  = angles.map((a, i) => generateJaggedSpoke(cx, cy, a, edgePts[i]));

      for (let i = 0; i < spokes.length; i++) {
        const cur = spokes[i], nxt = spokes[(i + 1) % spokes.length];
        const e1  = edgePts[i], e2 = edgePts[(i + 1) % edgePts.length];
        let pts = [{ x: cx, y: cy }, ...cur, ...perimeterSegment(e1, e2), ...[...nxt].reverse()];
        shards.push({
          points: pts, id: i + 1,
          clickState: 0, lastStateChange: 0,
          angle: 0, targetAngle: 0,
          scale: 1, targetScale: 1,
          offsetX: 0, targetOffsetX: 0,
          offsetY: 0, targetOffsetY: 0,
          img:   aiImages[i % aiImages.length],
          focal: FOCAL_POINTS[i] || { x: 0.5, y: 0.5 },
          center: calculateCentroid(pts),
          text:  SHARD_TEXTS[i] || ""
        });
      }
    }

    function generateJaggedSpoke(x, y, angle, edgePt) {
      const pts = [], steps = 6;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const bx = p.lerp(x, edgePt.x, t), by = p.lerp(y, edgePt.y, t);
        const jitter = (i < steps) ? p.random(-8 * SCALE, 8 * SCALE) : 0;
        pts.push({ x: bx + (-Math.sin(angle) * jitter), y: by + (Math.cos(angle) * jitter) });
      }
      return pts;
    }

    // ── draw shards ────────────────────────────────────────────────────
    function drawFissuredMirror() {
      for (const s of shards.filter(s => s.clickState !== 1)) drawShard(s);
      for (const s of shards.filter(s => s.clickState === 1)) drawShard(s);
    }

    function drawShard(s) {
      s.angle   = p.lerp(s.angle,   s.targetAngle,   0.1);
      s.scale   = p.lerp(s.scale,   s.targetScale,   0.08);
      s.offsetX = p.lerp(s.offsetX, s.targetOffsetX, 0.08);
      s.offsetY = p.lerp(s.offsetY, s.targetOffsetY, 0.08);

      const cx = s.center.x, cy = s.center.y;
      const tPts = s.points.map(pt => ({
        x: (pt.x - cx) * s.scale + cx + s.offsetX,
        y: (pt.y - cy) * s.scale + cy + s.offsetY
      }));
      const tcx = cx + s.offsetX, tcy = cy + s.offsetY;
      const xs = tPts.map(pt => pt.x), ys = tPts.map(pt => pt.y);
      const bx0 = p.min(xs), bx1 = p.max(xs), by0 = p.min(ys), by1 = p.max(ys);
      const bw = bx1 - bx0, bh = by1 - by0;

      p.push();
      p.drawingContext.save();
      p.beginShape(); for (const pt of tPts) p.vertex(pt.x, pt.y); p.endShape(p.CLOSE);
      p.drawingContext.clip();
      p.translate(tcx, tcy); p.scale(p.cos(s.angle), 1); p.translate(-tcx, -tcy);

      if (p.abs(s.angle) < p.HALF_PI) {
        // mirror side
        p.push();
        p.translate(tcx, tcy); p.scale(s.scale); p.translate(-tcx, -tcy);
        p.translate(CANVAS_W, 0); p.scale(-1, 1);
        p.image(video, videoOffsetX(), videoOffsetY(), videoDisplayW(), videoDisplayH());
        p.resetMatrix();
        p.fill(0, 120);
        p.beginShape(); for (const pt of tPts) p.vertex(pt.x, pt.y); p.endShape(p.CLOSE);
        p.pop();

        p.push();
        p.fill(255, 200); p.noStroke(); p.textAlign(p.CENTER, p.CENTER);
        p.textSize(14 * SCALE); p.textStyle(p.NORMAL);
        const centroid = calculateCentroid(tPts);
        p.text(s.text, centroid.x, centroid.y);
        p.pop();
      } else {
        // image side
        p.push();
        p.translate(tcx, tcy); p.scale(-1, 1); p.translate(-tcx, -tcy);
        if (s.img && s.img.width > 0) {
          const sc = p.max(bw / s.img.width, bh / s.img.height) * IMG_ZOOM;
          const iw = s.img.width * sc, ih = s.img.height * sc;
          const ix = p.constrain(tcx - s.focal.x * iw, tcx - s.focal.x * iw, bx1 - iw + (iw - s.focal.x * iw));
          const iy = p.constrain(tcy - s.focal.y * ih, tcy - s.focal.y * ih, by1 - ih + (ih - s.focal.y * ih));
          p.image(s.img, ix, iy, iw, ih);
        }
        p.pop();
      }

      p.drawingContext.restore();
      p.noFill(); p.stroke(255, 110); p.strokeWeight(1.5);
      p.beginShape(); for (const pt of tPts) p.vertex(pt.x, pt.y); p.endShape(p.CLOSE);
      p.pop();
    }

    // ── eye logic ──────────────────────────────────────────────────────
    function checkEyesOpen(face) {
      const l = face.keypoints[159], lb = face.keypoints[145];
      const r = face.keypoints[386], rb = face.keypoints[374];
      const d = (p.dist(l.x, l.y, lb.x, lb.y) + p.dist(r.x, r.y, rb.x, rb.y)) / 2;
      if (d > THRESHOLD) {
        if (openStartTime === 0) openStartTime = p.millis();
        if (p.millis() - openStartTime > 2000) createOrganicCracks();
      } else { openStartTime = 0; }
    }

    // ── mouse ──────────────────────────────────────────────────────────
    p.mousePressed = function () {
      if (state !== "FISSURED") return;
      let clicked = null;
      for (const s of shards.filter(s => s.clickState === 1))
        if (isPointInPoly(getTransformedPoints(s), p.mouseX, p.mouseY)) { clicked = s; break; }
      if (!clicked)
        for (const s of shards.filter(s => s.clickState !== 1))
          if (isPointInPoly(getTransformedPoints(s), p.mouseX, p.mouseY)) { clicked = s; break; }
      if (clicked) advanceShardState(clicked);
    };

    function getTransformedPoints(s) {
      const cx = s.center.x, cy = s.center.y;
      return s.points.map(pt => ({
        x: (pt.x - cx) * s.scale + cx + s.offsetX,
        y: (pt.y - cy) * s.scale + cy + s.offsetY
      }));
    }

    function advanceShardState(s) {
      s.clickState = (s.clickState + 1) % 3;
      s.lastStateChange = p.millis();
      if (s.clickState === 0) {
        s.targetAngle = 0;  s.targetScale = 1;
        s.targetOffsetX = 0; s.targetOffsetY = 0;
      } else if (s.clickState === 1) {
        s.targetAngle = p.PI; s.targetScale = 1.65;
        s.targetOffsetX = (CANVAS_W / 2 - s.center.x) * 0.25;
        s.targetOffsetY = (CANVAS_H / 2 - s.center.y) * 0.25;
      } else {
        s.targetAngle = p.PI; s.targetScale = 1;
        s.targetOffsetX = 0; s.targetOffsetY = 0;
      }
    }

    // ── utilities ──────────────────────────────────────────────────────
    function calculateCentroid(pts) {
      let x = 0, y = 0;
      for (const pt of pts) { x += pt.x; y += pt.y; }
      return { x: x / pts.length, y: y / pts.length };
    }

    function isPointInPoly(poly, px, py) {
      let col = false;
      for (let i = 0; i < poly.length; i++) {
        const vc = poly[i], vn = poly[(i + 1) % poly.length];
        if (((vc.y >= py && vn.y < py) || (vc.y < py && vn.y >= py)) &&
            (px < (vn.x - vc.x) * (py - vc.y) / (vn.y - vc.y) + vc.x))
          col = !col;
      }
      return col;
    }

  }, 'sketch-container');  // mount into #sketch-container

}; // end window.startSketch