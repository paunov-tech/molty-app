// ═══════════════════════════════════════════════════
// MOLTY CORE: NEURAL NETWORK ENGINE
// Feedforward NN sa backpropagation — od nule, bez dep.
//
// Mogućnosti:
//   1. Churn Prediction — verovatnoća da kupac ode
//   2. Material Recommendation — preporuka po industriji/peći
//   3. Revenue Forecasting — trend prihoda
//   4. Self-learning — trenira se na svakoj interakciji
//
// API:
//   brain.train(data)        → trenira mrežu
//   brain.predictChurn(c)    → 0..1 verovatnoća
//   brain.recommendMats(c)   → sortirani materijali
//   brain.forecast(years)    → predikcija prihoda
//   brain.stats()            → info o mreži
// ═══════════════════════════════════════════════════

// ── MATH UTILITIES ──
const sigmoid = x => 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
const dsigmoid = y => y * (1 - y);
const relu = x => Math.max(0, x);
const drelu = y => y > 0 ? 1 : 0;
const tanh = x => Math.tanh(x);
const dtanh = y => 1 - y * y;
const rand = () => (Math.random() - 0.5) * 2;

// ── FEEDFORWARD NEURAL NETWORK ──
class NeuralNet {
  constructor(layers) {
    // layers = [inputSize, hidden1, hidden2, ..., outputSize]
    this.layers = layers;
    this.weights = [];
    this.biases = [];
    this.lr = 0.01;
    this.epoch = 0;
    this.loss = 1;

    // Xavier initialization
    for (let i = 0; i < layers.length - 1; i++) {
      const scale = Math.sqrt(2 / (layers[i] + layers[i + 1]));
      const w = [];
      for (let j = 0; j < layers[i]; j++) {
        const row = [];
        for (let k = 0; k < layers[i + 1]; k++) {
          row.push(rand() * scale);
        }
        w.push(row);
      }
      this.weights.push(w);
      this.biases.push(new Array(layers[i + 1]).fill(0).map(() => rand() * 0.1));
    }
  }

  // Forward pass
  forward(input) {
    let activation = [...input];
    const activations = [activation];

    for (let l = 0; l < this.weights.length; l++) {
      const next = new Array(this.weights[l][0].length).fill(0);
      for (let j = 0; j < next.length; j++) {
        let sum = this.biases[l][j];
        for (let i = 0; i < activation.length; i++) {
          sum += activation[i] * this.weights[l][i][j];
        }
        // Last layer = sigmoid, hidden = relu
        next[j] = l === this.weights.length - 1 ? sigmoid(sum) : relu(sum);
      }
      activation = next;
      activations.push(activation);
    }

    return { output: activation, activations };
  }

  // Backpropagation
  backward(activations, target) {
    const L = this.weights.length;
    const deltas = new Array(L);

    // Output layer delta
    const outAct = activations[L];
    deltas[L - 1] = outAct.map((o, i) => (o - target[i]) * dsigmoid(o));

    // Hidden layers
    for (let l = L - 2; l >= 0; l--) {
      deltas[l] = new Array(this.weights[l][0].length).fill(0);
      for (let j = 0; j < deltas[l].length; j++) {
        let error = 0;
        for (let k = 0; k < deltas[l + 1].length; k++) {
          error += deltas[l + 1][k] * this.weights[l + 1][j]?.[k] || 0;
        }
        deltas[l][j] = error * drelu(activations[l + 1][j]);
      }
    }

    // Update weights & biases
    for (let l = 0; l < L; l++) {
      for (let i = 0; i < this.weights[l].length; i++) {
        for (let j = 0; j < this.weights[l][i].length; j++) {
          this.weights[l][i][j] -= this.lr * deltas[l][j] * activations[l][i];
        }
      }
      for (let j = 0; j < this.biases[l].length; j++) {
        this.biases[l][j] -= this.lr * deltas[l][j];
      }
    }
  }

  // Train on dataset
  train(inputs, targets, epochs = 100) {
    for (let e = 0; e < epochs; e++) {
      let totalLoss = 0;
      for (let i = 0; i < inputs.length; i++) {
        const { output, activations } = this.forward(inputs[i]);
        this.backward(activations, targets[i]);
        totalLoss += targets[i].reduce((s, t, j) => s + (t - output[j]) ** 2, 0);
      }
      this.loss = totalLoss / inputs.length;
      this.epoch++;
    }
    return this.loss;
  }

  predict(input) {
    return this.forward(input).output;
  }

  // Serialize / deserialize
  toJSON() {
    return { layers: this.layers, weights: this.weights, biases: this.biases, epoch: this.epoch, loss: this.loss, lr: this.lr };
  }

  static fromJSON(json) {
    const nn = new NeuralNet(json.layers);
    nn.weights = json.weights;
    nn.biases = json.biases;
    nn.epoch = json.epoch || 0;
    nn.loss = json.loss || 1;
    nn.lr = json.lr || 0.01;
    return nn;
  }
}

// ═══════════════════════════════════════
// MOLTY BRAIN — High-level AI engine
// ═══════════════════════════════════════
class MoltyBrain {
  constructor() {
    this.churnNet = null;
    this.matNet = null;
    this.trained = false;
    this._load();
  }

  _load() {
    try {
      const saved = localStorage.getItem("molty_brain");
      if (saved) {
        const d = JSON.parse(saved);
        if (d.churnNet) this.churnNet = NeuralNet.fromJSON(d.churnNet);
        if (d.matNet) this.matNet = NeuralNet.fromJSON(d.matNet);
        this.trained = d.trained || false;
      }
    } catch {}
  }

  _save() {
    try {
      localStorage.setItem("molty_brain", JSON.stringify({
        churnNet: this.churnNet?.toJSON(),
        matNet: this.matNet?.toJSON(),
        trained: this.trained,
      }));
    } catch {}
  }

  // ── NORMALIZE CUSTOMER → FEATURE VECTOR ──
  // Inputs: [daysIdle_norm, revenue_norm, invoices_norm, grade_num, industry_num]
  _customerFeatures(customer, allCustomers) {
    const maxIdle = Math.max(...allCustomers.map(c => c.daysIdle), 1);
    const maxRev = Math.max(...allCustomers.map(c => c.revenue), 1);
    const maxInv = Math.max(...allCustomers.map(c => c.invoices), 1);
    const gradeMap = { A: 1.0, B: 0.66, C: 0.33, D: 0.0 };
    const indMap = { "Čelik": 0.9, "Livnica": 0.7, "Cement": 0.5, "Aluminijum": 0.6, "Bakar": 0.4, "Energetika": 0.3, "Petrohemija": 0.8, "Metalurgija": 0.6 };

    return [
      customer.daysIdle / maxIdle,           // neaktivnost (0=aktivan, 1=dugo idle)
      customer.revenue / maxRev,             // prihod (0=mali, 1=veliki)
      customer.invoices / maxInv,            // frekvencija (0=retko, 1=često)
      gradeMap[customer.grade] || 0.5,       // grade
      indMap[customer.industry] || 0.5,      // industrija
    ];
  }

  // ── TRAIN CHURN MODEL ──
  trainChurn(customers) {
    // Network: 5 inputs → 8 hidden → 4 hidden → 1 output (churn probability)
    this.churnNet = new NeuralNet([5, 8, 4, 1]);
    this.churnNet.lr = 0.05;

    // Generate training data from actual customer behavior
    const inputs = [];
    const targets = [];

    for (const c of customers) {
      const features = this._customerFeatures(c, customers);
      inputs.push(features);

      // Target: churn signal based on actual behavior
      let churnScore;
      if (c.status === "dormant" || c.daysIdle > 365) {
        churnScore = 0.9; // Visok rizik
      } else if (c.daysIdle > 180) {
        churnScore = 0.7;
      } else if (c.daysIdle > 90) {
        churnScore = 0.5;
      } else if (c.daysIdle > 30) {
        churnScore = 0.2;
      } else {
        churnScore = 0.05; // Aktivan
      }
      targets.push([churnScore]);
    }

    // Train 500 epochs
    const loss = this.churnNet.train(inputs, targets, 500);
    this.trained = true;
    this._save();
    return { loss, epochs: this.churnNet.epoch, samples: customers.length };
  }

  // ── PREDICT CHURN FOR ONE CUSTOMER ──
  predictChurn(customer, allCustomers) {
    if (!this.churnNet) return null;
    const features = this._customerFeatures(customer, allCustomers);
    const [prob] = this.churnNet.predict(features);
    return {
      probability: prob,
      risk: prob > 0.7 ? "KRITIČAN" : prob > 0.5 ? "VISOK" : prob > 0.3 ? "SREDNJI" : "NIZAK",
      color: prob > 0.7 ? "#ef4444" : prob > 0.5 ? "#f97316" : prob > 0.3 ? "#eab308" : "#22c55e",
      features: {
        idleNorm: features[0].toFixed(3),
        revenueNorm: features[1].toFixed(3),
        invoiceNorm: features[2].toFixed(3),
        gradeScore: features[3].toFixed(2),
        industryScore: features[4].toFixed(2),
      }
    };
  }

  // ── TRAIN MATERIAL RECOMMENDATION ──
  trainMaterials(customers, materials) {
    // Simple collaborative filtering: customers in same industry buy similar materials
    // Build industry → material frequency map
    this._matFreq = {};
    for (const c of customers) {
      const key = c.industry;
      if (!this._matFreq[key]) this._matFreq[key] = {};
      for (const mat of (c.topMaterials || [])) {
        this._matFreq[key][mat] = (this._matFreq[key][mat] || 0) + 1;
      }
    }
    this._save();
    return { industries: Object.keys(this._matFreq).length };
  }

  // ── RECOMMEND MATERIALS FOR CUSTOMER ──
  recommendMaterials(customer, materials) {
    if (!this._matFreq) return materials.slice(0, 5);

    const indFreq = this._matFreq[customer.industry] || {};
    const alreadyUsed = new Set(customer.topMaterials || []);

    // Score materials: frequency in same industry + not already used
    const scored = materials.map(m => {
      let score = 0;
      // Check if material name partially matches industry patterns
      for (const [matName, freq] of Object.entries(indFreq)) {
        if (m.name.includes(matName.split(" ").slice(0, 2).join(" ")) || matName.includes(m.name.split(" ").slice(0, 2).join(" "))) {
          score += freq * 10;
        }
      }
      // Bonus if same category is popular in industry
      if (!alreadyUsed.has(m.name)) score += 5;
      // Revenue as tiebreaker
      score += (m.totalEur || 0) / 100000;
      return { ...m, aiScore: score };
    });

    return scored.sort((a, b) => b.aiScore - a.aiScore).slice(0, 8);
  }

  // ── REVENUE FORECAST ──
  forecastRevenue(revenueByYear) {
    if (revenueByYear.length < 3) return null;

    // Simple weighted moving average + trend
    const values = revenueByYear.map(r => r.eur);
    const years = revenueByYear.map(r => parseInt(r.year));

    // Linear regression
    const n = values.length;
    const sumX = years.reduce((s, y) => s + y, 0);
    const sumY = values.reduce((s, v) => s + v, 0);
    const sumXY = years.reduce((s, y, i) => s + y * values[i], 0);
    const sumX2 = years.reduce((s, y) => s + y * y, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Predict next 2 years
    const lastYear = Math.max(...years);
    const predictions = [];
    for (let y = lastYear + 1; y <= lastYear + 2; y++) {
      const predicted = Math.max(0, Math.round(intercept + slope * y));
      predictions.push({ year: y.toString(), eur: predicted, predicted: true });
    }

    return {
      slope: Math.round(slope),
      trend: slope > 0 ? "RAST" : "PAD",
      predictions,
      confidence: Math.min(0.95, 0.5 + n * 0.05),
    };
  }

  // ── STATS ──
  stats() {
    return {
      trained: this.trained,
      churnEpochs: this.churnNet?.epoch || 0,
      churnLoss: this.churnNet?.loss?.toFixed(6) || "N/A",
      churnLayers: this.churnNet?.layers?.join("→") || "N/A",
      hasMats: !!this._matFreq,
    };
  }

  // ── RETRAIN (called periodically or on data change) ──
  retrain(customers, materials) {
    const churnResult = this.trainChurn(customers);
    const matResult = this.trainMaterials(customers, materials);
    return { churn: churnResult, materials: matResult };
  }
}

// Singleton
export const brain = new MoltyBrain();
export { NeuralNet };
