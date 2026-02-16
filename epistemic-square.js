class EpistemicSquare {
  constructor(options = {}) {
    this.angle = options.initialAngle || 0;
    this.spinSpeed = options.spinSpeed || 0.5;
    this.autoRotate = options.autoRotate !== false;
    this.fanoPoints = [];
    this.quadrants = {
      KK: [],
      KU: [],
      UK: [],
      UU: []
    };
    
    this.FANO_NAMES = ['Metatron', 'Solomon', 'Solon', 'Asabiyyah', 'Enoch', 'Speaker', 'Genesis', 'Observer'];
    this.FANO_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'white'];
    this.FANO_HUES = [0, 30, 60, 120, 240, 270, 300, 0];
    
    this.initPoints();
  }
  
  initPoints() {
    const coords = [
      { x: 0.15, y: 0.15 },   // Point 1 - Metatron (red)
      { x: 0.35, y: 0.15 },   // Point 2 - Solomon (orange)
      { x: -0.05, y: 0.15 },  // Point 3 - Solon (yellow)
      { x: 0.0, y: -0.25 },   // Point 4 - Asabiyyah (green)
      { x: -0.35, y: 0.15 },  // Point 5 - Enoch (blue)
      { x: 0.35, y: 0.15 },   // Point 6 - Speaker (indigo) - adjusted
      { x: 0.0, y: 0.35 }     // Point 7 - Genesis (violet)
    ];
    
    this.fanoPoints = coords.map((coord, i) => ({
      id: i + 1,
      name: this.FANO_NAMES[i],
      color: this.FANO_COLORS[i],
      hue: this.FANO_HUES[i],
      baseX: coord.x,
      baseY: coord.y,
      x: coord.x,
      y: coord.y,
      quadrant: null,
      confidence: 1.0,
      value: 1.0
    }));
  }
  
  rotate() {
    if (!this.autoRotate) return;
    
    const rad = -this.angle * Math.PI / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    
    this.fanoPoints.forEach(point => {
      point.x = point.baseX * cosA - point.baseY * sinA;
      point.y = point.baseX * sinA + point.baseY * cosA;
    });
    
    this.angle += this.spinSpeed;
    if (this.angle >= 360) this.angle -= 360;
    
    this.updateQuadrants();
  }
  
  updateQuadrants() {
    this.quadrants = { KK: [], KU: [], UK: [], UU: [] };
    
    this.fanoPoints.forEach(point => {
      if (point.x >= 0 && point.y >= 0) {
        point.quadrant = 'KK';
        this.quadrants.KK.push(point.id);
      } else if (point.x < 0 && point.y >= 0) {
        point.quadrant = 'KU';
        this.quadrants.KU.push(point.id);
      } else if (point.x >= 0 && point.y < 0) {
        point.quadrant = 'UK';
        this.quadrants.UK.push(point.id);
      } else {
        point.quadrant = 'UU';
        this.quadrants.UU.push(point.id);
      }
    });
  }
  
  getState() {
    this.rotate();
    
    return {
      angle: this.angle,
      quadrants: { ...this.quadrants },
      matrix: this.fanoPoints.map(p => {
        switch(p.quadrant) {
          case 'KK': return 0;
          case 'KU': return 1;
          case 'UK': return 2;
          case 'UU': return 3;
          default: return 0;
        }
      }),
      points: this.fanoPoints.map(p => ({
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        quadrant: p.quadrant
      }))
    };
  }
  
  getMnemonic() {
    const state = this.getState();
    
    let bits = 0;
    for (let i = 0; i < 7; i++) {
      bits |= (state.matrix[i] << (i * 2));
    }
    
    const angleBits = Math.floor(this.angle * (1024 / 360)) & 0x3FF;
    const seed = (bits << 10) | angleBits;
    
    const word1 = (seed & 0x3FF).toString(16).padStart(3, '0');
    const word2 = ((seed >> 10) & 0x3FF).toString(16).padStart(3, '0');
    const word3 = ((seed >> 20) & 0xFFF).toString(16).padStart(3, '0');
    
    return {
      seed: seed,
      hex: `${word1}-${word2}-${word3}`,
      angle: this.angle,
      quadrants: state.quadrants
    };
  }
  
  askQuestion(qNum) {
    const state = this.getState();
    
    const questions = {
      1: {
        id: 1,
        name: 'Known Knowns',
        question: 'What do you know you know?',
        points: state.quadrants.KK,
        color: '#00ff00',
        description: 'Certainties, facts, axioms'
      },
      2: {
        id: 2,
        name: 'Known Unknowns',
        question: 'What do you think you know?',
        points: state.quadrants.KU,
        color: '#ffff00',
        description: 'Questions, hypotheses, doubts'
      },
      3: {
        id: 3,
        name: 'Unknown Knowns',
        question: 'What do you know you don\'t know?',
        points: state.quadrants.UK,
        color: '#ff8800',
        description: 'Tacit knowledge, intuitions'
      },
      4: {
        id: 4,
        name: 'Unknown Unknowns',
        question: 'What don\'t you know you don\'t know?',
        points: state.quadrants.UU,
        color: '#0000ff',
        description: 'Potential, void, discovery'
      }
    };
    
    return questions[qNum] || null;
  }
  
  answerQuestion(qNum, answers) {
    const q = this.askQuestion(qNum);
    if (!q) return;
    
    q.points.forEach((pointId, i) => {
      const point = this.fanoPoints.find(p => p.id === pointId);
      if (point && answers[i]) {
        point.confidence = answers[i].confidence !== undefined ? answers[i].confidence : 1.0;
        point.value = answers[i].value !== undefined ? answers[i].value : 1.0;
      }
    });
  }
  
  setSpeed(speed) {
    this.spinSpeed = speed;
  }
  
  setAutoRotate(auto) {
    this.autoRotate = auto;
  }
  
  setAngle(angle) {
    this.angle = angle % 360;
    this.rotate();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EpistemicSquare;
}
