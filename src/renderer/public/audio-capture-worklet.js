class DiscorjaFilteredAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.packets = [];
    this.packetFrame = 0;
    this.port.onmessage = ({ data }) => {
      if (!(data instanceof ArrayBuffer) || data.byteLength < 4) return;
      this.packets.push(new Int16Array(data));
      while (this.packets.length > 24) this.packets.shift();
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1];
    left.fill(0);
    right.fill(0);

    let frame = 0;
    while (frame < left.length && this.packets.length > 0) {
      const packet = this.packets[0];
      while (frame < left.length && this.packetFrame * 2 < packet.length) {
        const sample = this.packetFrame * 2;
        left[frame] = packet[sample] / 32768;
        right[frame] = packet[sample + 1] / 32768;
        frame += 1;
        this.packetFrame += 1;
      }
      if (this.packetFrame * 2 >= packet.length) {
        this.packets.shift();
        this.packetFrame = 0;
      }
    }
    return true;
  }
}

registerProcessor('discorja-filtered-audio', DiscorjaFilteredAudio);
