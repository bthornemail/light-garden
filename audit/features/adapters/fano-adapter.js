class FanoAdapter {
  matrixFromSeed(seed) {
    const matrix = [];
    for (let i = 0; i < 7; i++) matrix.push((seed >> (i * 2)) & 0x03);
    return matrix;
  }
}

module.exports = FanoAdapter;
