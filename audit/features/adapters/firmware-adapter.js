class FirmwareAdapter {
  simulateAnalog(pin) {
    if (pin < 0 || pin > 39) return { ok: false, error: 'INVALID_PIN' };
    return { ok: true, value: 2048 };
  }
}

module.exports = FirmwareAdapter;
