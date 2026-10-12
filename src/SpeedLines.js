// Dynamic Comic/Anime-style Speed lines canvas overlay
export class SpeedLinesEffect {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lines = [];
    this.intensity = 0; // 0 to 1
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Generate line pool
    for (let i = 0; i < 80; i++) {
      this.lines.push({
        angle: Math.random() * Math.PI * 2,
        dist: Math.random(),
        length: 50 + Math.random() * 150,
        speed: 0.02 + Math.random() * 0.04,
        alpha: Math.random() * 0.6 + 0.2,
        width: 1 + Math.random() * 2.5
      });
    }
  }

  resize() {
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
    this.cx = this.width / 2;
    this.cy = this.height / 2;
  }

  setSpeed(speed, delta = 1 / 60) {
    // Activates when speed > 22
    const target = Math.min(Math.max((speed - 22) / 38, 0), 1);
    this.intensity += (target - this.intensity) * (1 - Math.exp(-9.75 * delta));
  }

  render(delta = 1 / 60) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    if (this.intensity < 0.02) return;

    const count = Math.floor(this.lines.length * this.intensity);
    const maxR = Math.hypot(this.cx, this.cy);
    const innerDeadzone = maxR * 0.35; // Center stays relatively clear

    this.ctx.save();
    this.ctx.translate(this.cx, this.cy);

    for (let i = 0; i < count; i++) {
      const line = this.lines[i];
      line.dist += line.speed * (0.8 + this.intensity * 1.5) * delta * 60;
      if (line.dist > 1) {
        line.dist = 0;
        line.angle = Math.random() * Math.PI * 2;
      }

      const r1 = innerDeadzone + line.dist * (maxR - innerDeadzone);
      const r2 = r1 + line.length * (0.5 + this.intensity * 0.8);

      const cos = Math.cos(line.angle);
      const sin = Math.sin(line.angle);

      const x1 = cos * r1;
      const y1 = sin * r1;
      const x2 = cos * r2;
      const y2 = sin * r2;

      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.strokeStyle = `rgba(255, 255, 255, ${line.alpha * this.intensity * 0.65})`;
      this.ctx.lineWidth = line.width;
      this.ctx.lineCap = 'round';
      this.ctx.stroke();
    }

    this.ctx.restore();
  }
}
