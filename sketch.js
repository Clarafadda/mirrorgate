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

    const HOLD_FRAMES  = 20;
    const COOLDOWN_MS  = 1200;
    let lastFingerCount = 0, fingerHoldFrames = 0, lastTriggerTime = 0;

    // ── personalised texts ─────────────────────────────────────────────
    const SHARD_TEXTS_BY_USER = {
      clara: [
        "The Mapped Life\nI know where you are.\n1",
        "Public Profile\nI can contact you.\n2 ",
        "Frozen Past\nYou never disappear.\n3",
        "Search Exposure\nI can find you.\n4",
        "Face Recognition\nI can recognize you.\n5",
        "Username Everywhere\nI can trace you.\n6"
      ],
      laura: [
        "The Mapped Life\nI know where you were.\n1",
        "Public Profile\nI can contact you.\n2",
        "Public face\nYour face can be used\n3",
        "Search Exposure\nI can find you.\n4",
        "Face Recognition\nI can recognize you.\n5",
        "Frozen Past\nYou never disappear.\n6"
      ],
      mariana: [
        "Mariana Frag 1", "Mariana Frag 2", "Mariana Frag 3", 
        "Mariana Frag 4", "Mariana Frag 5", "Mariana Frag 6"
      ]
    };

    function getShardTexts() {
      const user = window.selectedUser;
      return (user && SHARD_TEXTS_BY_USER[user]) ? SHARD_TEXTS_BY_USER[user] : ["..."];
    }

    const FOCAL_POINTS = [
      { x: 0.4,  y: 0.4  }, { x: 0.51, y: 0.56 }, { x: 0.6,  y: 0.34 },
      { x: 0.62, y: 0.55 }, { x: 0.55, y: 0.45 }, { x: 0.45, y: 0.5  },
    ];

    function computeCanvasSize() {
      CANVAS_W = p.windowWidth; CANVAS_H = p.windowHeight;
      SCALE = p.min(CANVAS_W / BASE_W, CANVAS_H / BASE_H);
    }
    function videoCoverScale() { return p.max(CANVAS_W / VID_W, CANVAS_H / VID_H); }
    function videoDisplayW()   { return VID_W * videoCoverScale(); }
    function videoDisplayH()   { return VID_H * videoCoverScale(); }
    function videoOffsetX()    { return (CANVAS_W - videoDisplayW()) / 2; }
    function videoOffsetY()    { return (CANVAS_H - videoDisplayH()) / 2; }

    p.preload = function () {
      faceMesh = ml5.faceMesh({ maxFaces: 1, refineLandmarks: true, flipHorizontal: true });
      handPose = ml5.handPose({ maxHands: 2, flipHorizontal: true });
      const user = window.selectedUser;
      const folder = user ? "fragment_" + user + "/" : "";
      for (let i = 0; i < 6; i++) {
        aiImages[i] = p.loadImage(folder + "fragment3." + (i + 1) + ".png");
      }
    };

    p.setup = function () {
      computeCanvasSize();
      const cnv = p.createCanvas(CANVAS_W, CANVAS_H);
      cnv.parent('sketch-container');
      video = p.createCapture(p.VIDEO);
      video.size(VID_W, VID_H);
      video.hide();
      faceMesh.detectStart(video, r => faces = r);
      handPose.detectStart(video, r => hands = r);
    };

    p.windowResized = function () {
      computeCanvasSize(); p.resizeCanvas(CANVAS_W, CANVAS_H);
      if (state === "FISSURED") createOrganicCracks();
    };

    p.draw = function () {
      p.background(10);
      if (faces.length > 0) {
        if (state === "LOCKED") {
          drawFullScreenVideo();
          checkEyesOpen(faces[0]);
        } else {
          updateShardTimers();
          checkHandGesture();
          drawFissuredMirror();
        }
      }
    };

    function updateShardTimers() {
      const now = p.millis();
      for (const s of shards) {
        if (s.clickState === 1 && now - s.lastStateChange > 2000) advanceShardState(s);
        else if (s.clickState === 2 && now - s.lastStateChange > 2500) advanceShardState(s);
      }
    }

    function checkHandGesture() {
      if (hands.length === 0) { fingerHoldFrames = 0; return; }
      let total = 0;
      for (const h of hands) total += countFingers(h);
      if (total < 1 || total > 6) { fingerHoldFrames = 0; return; }
      if (total === lastFingerCount) fingerHoldFrames++;
      else { lastFingerCount = total; fingerHoldFrames = 1; }
      if (fingerHoldFrames === HOLD_FRAMES && p.millis() - lastTriggerTime > COOLDOWN_MS) {
        lastTriggerTime = p.millis(); fingerHoldFrames = 0;
        if (shards[total - 1]) advanceShardState(shards[total - 1]);
      }
    }

    function countFingers(hand) {
      const kp = hand.keypoints;
      const fUp = (t, b) => kp[t].y < kp[b].y;
      let c = 0;
      if (p.abs(kp[4].x - kp[0].x) > p.abs(kp[2].x - kp[0].x)) c++;
      if (fUp(8,5)) c++; if (fUp(12,9)) c++; if (fUp(16,13)) c++; if (fUp(20,17)) c++;
      return c;
    }

    function drawFullScreenVideo() {
      p.push();
      p.translate(CANVAS_W, 0); p.scale(-1, 1);
      p.image(video, videoOffsetX(), videoOffsetY(), videoDisplayW(), videoDisplayH());
      p.resetMatrix();
      p.fill(0, 180); p.rect(0, 0, CANVAS_W, CANVAS_H);
      p.pop();

      if (openStartTime > 0) {
        const prog = p.map(p.millis() - openStartTime, 0, 2000, 0, p.TWO_PI);
        const r = p.min(CANVAS_W, CANVAS_H) * 0.06;
        p.push();
        p.stroke(255, 180); p.strokeWeight(3 * SCALE); p.noFill();
        p.arc(CANVAS_W/2, CANVAS_H/2, r*2, r*2, -p.HALF_PI, prog - p.HALF_PI);
        p.pop();
      }
    }

    // ── THE MOMENT THE MIRROR BREAKS ────────────────────────────────────
    function createOrganicCracks() {
      state = "FISSURED"; 
      shards = [];
      
      // 1. Clear the Assignment Message
      const am = document.getElementById('assignment-msg');
      if (am) am.classList.remove('visible-now');

      // 2. Show the How-to switch instructions
      const im = document.getElementById('instruction-msg');
      if (im) im.classList.add('visible-now');

      const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
      const angles = [];
      for (let i = 0; i < NB_FISSURES; i++)
        angles.push(p.map(i, 0, NB_FISSURES, 0, p.TWO_PI) + p.random(-0.1, 0.1));
      
      const edgePts = angles.map(a => pointOnScreenEdge(a));
      const spokes  = angles.map((a, i) => generateJaggedSpoke(cx, cy, a, edgePts[i]));
      const shardTexts = getShardTexts();

      for (let i = 0; i < spokes.length; i++) {
        const cur = spokes[i], nxt = spokes[(i + 1) % spokes.length];
        const e1  = edgePts[i], e2 = edgePts[(i + 1) % edgePts.length];
        let pts = [{ x: cx, y: cy }, ...cur, ...perimeterSegment(e1, e2), ...[...nxt].reverse()];
        shards.push({
          points: pts, clickState: 0, lastStateChange: 0, hasBeenFlipped: false,
          angle: 0, targetAngle: 0, scale: 1, targetScale: 1,
          offsetX: 0, targetOffsetX: 0, offsetY: 0, targetOffsetY: 0,
          img: aiImages[i], focal: FOCAL_POINTS[i] || {x:0.5, y:0.5},
          center: calculateCentroid(pts), text: shardTexts[i] || ""
        });
      }
    }

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
      const getWall = pt => {
        if (Math.abs(pt.y) < EPS) return 0; if (Math.abs(pt.x - W) < EPS) return 1;
        if (Math.abs(pt.y - H) < EPS) return 2; if (Math.abs(pt.x) < EPS) return 3;
        return -1;
      };
      const perimPos = pt => {
        const perim = 2*(W+H), w = getWall(pt);
        if (w === 0) return pt.x / perim; if (w === 1) return (W + pt.y) / perim;
        if (w === 2) return (W + H + (W - pt.x)) / perim;
        return (2 * W + H + (H - pt.y)) / perim;
      };
      let pos1 = perimPos(p1), pos2 = perimPos(p2);
      if (pos2 <= pos1) pos2 += 1;
      let pts = [{x:W,y:0}, {x:W,y:H}, {x:0,y:H}, {x:0,y:0}].filter(c => {
        let cp = perimPos(c); if (cp <= pos1) cp += 1; return cp > pos1 && cp < pos2;
      });
      pts.sort((a,b) => {
        let pa = perimPos(a), pb = perimPos(b);
        if (pa <= pos1) pa += 1; if (pb <= pos1) pb += 1; return pa - pb;
      });
      pts.push(p2); return pts;
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

    function drawFissuredMirror() {
      for (const s of shards.filter(s => s.clickState !== 1)) drawShard(s);
      for (const s of shards.filter(s => s.clickState === 1)) drawShard(s);
    }

    function drawShard(s) {
      s.angle = p.lerp(s.angle, s.targetAngle, 0.1);
      s.scale = p.lerp(s.scale, s.targetScale, 0.08);
      s.offsetX = p.lerp(s.offsetX, s.targetOffsetX, 0.08);
      s.offsetY = p.lerp(s.offsetY, s.targetOffsetY, 0.08);

      const cx = s.center.x, cy = s.center.y;
      const tPts = s.points.map(pt => ({
        x: (pt.x - cx) * s.scale + cx + s.offsetX,
        y: (pt.y - cy) * s.scale + cy + s.offsetY
      }));
      const tcx = cx + s.offsetX, tcy = cy + s.offsetY;

      p.push();
      p.drawingContext.save();
      p.beginShape(); for (const pt of tPts) p.vertex(pt.x, pt.y); p.endShape(p.CLOSE);
      p.drawingContext.clip();
      p.translate(tcx, tcy); p.scale(p.cos(s.angle), 1); p.translate(-tcx, -tcy);

      if (p.abs(s.angle) < p.HALF_PI) {
        p.push();
        p.translate(tcx, tcy); p.scale(s.scale); p.translate(-tcx, -tcy);
        p.translate(CANVAS_W, 0); p.scale(-1, 1);
        p.image(video, videoOffsetX(), videoOffsetY(), videoDisplayW(), videoDisplayH());
        p.resetMatrix();
        p.fill(0, 140); p.rect(0,0,CANVAS_W,CANVAS_H);
        p.pop();
        if (s.hasBeenFlipped) {
          p.fill(255, 220); p.textAlign(p.CENTER, p.CENTER); p.textSize(14 * SCALE);
          p.text(s.text, calculateCentroid(tPts).x, calculateCentroid(tPts).y);
        }
      } else {
        p.push();
        p.translate(tcx, tcy); p.scale(-1, 1); p.translate(-tcx, -tcy);
        if (s.img) {
          const sc = p.max((p.max(tPts.map(p=>p.x))-p.min(tPts.map(p=>p.x))) / s.img.width, (p.max(tPts.map(p=>p.y))-p.min(tPts.map(p=>p.y))) / s.img.height) * IMG_ZOOM;
          p.image(s.img, tcx - s.focal.x * (s.img.width * sc), tcy - s.focal.y * (s.img.height * sc), s.img.width * sc, s.img.height * sc);
        }
        p.pop();
      }
      p.drawingContext.restore();
      p.noFill(); p.stroke(255, 80); p.strokeWeight(1.5);
      p.beginShape(); for (const pt of tPts) p.vertex(pt.x, pt.y); p.endShape(p.CLOSE);
      p.pop();
    }

    function checkEyesOpen(face) {
      const d = (p.dist(face.keypoints[159].x, face.keypoints[159].y, face.keypoints[145].x, face.keypoints[145].y) + 
                 p.dist(face.keypoints[386].x, face.keypoints[386].y, face.keypoints[374].x, face.keypoints[374].y)) / 2;
      if (d > THRESHOLD) {
        if (openStartTime === 0) openStartTime = p.millis();
        if (p.millis() - openStartTime > 2000) createOrganicCracks();
      } else openStartTime = 0;
    }

    p.mousePressed = function () {
      if (state !== "FISSURED") return;
      let clicked = shards.find(s => isPointInPoly(getTransformedPoints(s), p.mouseX, p.mouseY));
      if (clicked) advanceShardState(clicked);
    };

    function getTransformedPoints(s) {
      return s.points.map(pt => ({
        x: (pt.x - s.center.x) * s.scale + s.center.x + s.offsetX,
        y: (pt.y - s.center.y) * s.scale + s.center.y + s.offsetY
      }));
    }

    function advanceShardState(s) {
      s.clickState = (s.clickState + 1) % 3;
      s.lastStateChange = p.millis();
      if (s.clickState === 0) { s.targetAngle = 0; s.targetScale = 1; s.targetOffsetX = 0; s.targetOffsetY = 0; }
      else if (s.clickState === 1) { 
        s.hasBeenFlipped = true; s.targetAngle = p.PI; s.targetScale = 1.65;
        s.targetOffsetX = (CANVAS_W/2 - s.center.x) * 0.25; s.targetOffsetY = (CANVAS_H/2 - s.center.y) * 0.25;
      } else { s.targetAngle = p.PI; s.targetScale = 1; s.targetOffsetX = 0; s.targetOffsetY = 0; }
    }

    function calculateCentroid(pts) {
      let x = 0, y = 0;
      for (const pt of pts) { x += pt.x; y += pt.y; }
      return { x: x / pts.length, y: y / pts.length };
    }

    function isPointInPoly(poly, px, py) {
      let col = false;
      for (let i = 0; i < poly.length; i++) {
        let vc = poly[i], vn = poly[(i + 1) % poly.length];
        if (((vc.y >= py && vn.y < py) || (vc.y < py && vn.y >= py)) &&
            (px < (vn.x - vc.x) * (py - vc.y) / (vn.y - vc.y) + vc.x)) col = !col;
      }
      return col;
    }

  }, 'sketch-container');
};