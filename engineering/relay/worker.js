import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
export class KnowledgeLink extends DurableObject {
  pending = new Map();
  async fetch() {
    const pair = new WebSocketPair();
    for (const old of this.ctx.getWebSockets()) old.close(1000, 'Reconnecting');
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async request(request) {
    const ws = this.ctx.getWebSockets()[0];
    if (!ws || this.pending.size >= 32) throw new Error('Knowledge link unavailable');
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Knowledge request timed out'));
      }, 12000);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(msg);
      });
      try {
        ws.send(JSON.stringify({ id, request }));
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error('Knowledge link closed'));
      }
    });
  }
  webSocketMessage(_ws, raw) {
    const msg = JSON.parse(raw);
    this.pending.get(msg.id)?.(msg);
  }
  webSocketClose(ws) {
    ws.close();
  }
}
export default class extends WorkerEntrypoint {
  hub() {
    return this.env.HUB.get(this.env.HUB.idFromName('engineering'));
  }
  async fetch(req) {
    if (
      new URL(req.url).pathname === '/backup' &&
      req.method === 'PUT' &&
      this.env.WF_BACKUP_KEY &&
      req.headers.get('authorization') === 'Bearer ' + this.env.WF_BACKUP_KEY
    ) {
      const size = Number(req.headers.get('content-length'));
      if (!Number.isSafeInteger(size) || size < 64 || size > 12000000)
        return new Response('Invalid length', { status: 413 });
      const bytes = await req.arrayBuffer();
      if (bytes.byteLength !== size) return new Response('Length mismatch', { status: 400 });
      const key = 'daily/' + new Date().toISOString().slice(0, 10) + '.pgdump.gpg';
      await this.env.BACKUPS.put(key, bytes, { expirationTtl: 35 * 86400 });
      return Response.json({ key, bytes: size });
    }
    if (
      new URL(req.url).pathname != '/connect' ||
      req.headers.get('Upgrade')?.toLowerCase() !== 'websocket' ||
      !this.env.WF_KEY ||
      req.headers.get('Authorization') !== 'Bearer ' + this.env.WF_KEY
    )
      return new Response('Not found', { status: 404 });
    return this.hub().fetch(req);
  }
  async request(input) {
    return this.hub().request(input);
  }
}
