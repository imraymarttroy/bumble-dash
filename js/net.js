/*
 * Multiplayer networking (up to 4 players) using PeerJS / WebRTC.
 *
 * No server of our own is needed: the free PeerJS cloud broker is only used
 * to find each other by room code; game data then flows browser-to-browser.
 *
 * Topology: star. The host owns the room (peer id = PREFIX + CODE); every
 * guest connects to the host, and the host relays messages to the others.
 */
const Net = (() => {
  const PREFIX = "jemejeme-v1-";
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
  const CODE_LEN = 5;
  const MAX_PLAYERS = 4;
  const COLORS = ["#ffcc33", "#4fc3f7", "#ff6b8b", "#7ed957"];

  let peer = null;
  let isHost = false;
  let code = null;
  let myId = null;
  let hostConn = null; // guest -> host connection
  const conns = new Map(); // host: peerId -> connection
  let players = []; // [{ id, name, slot }]
  let locked = false; // host: refuse new players while a match is running
  const handlers = {};

  const on = (ev, fn) => (handlers[ev] = handlers[ev] || []).push(fn);
  const emit = (ev, ...args) => (handlers[ev] || []).forEach((fn) => fn(...args));

  function genCode() {
    let s = "";
    for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  }

  function errorText(err) {
    switch (err && err.type) {
      case "peer-unavailable": return "Room not found. Check the code.";
      case "browser-incompatible": return "This browser doesn't support multiplayer.";
      case "network":
      case "server-error":
      case "socket-error":
      case "socket-closed": return "Can't reach the matchmaking server. Check your internet.";
      default: return "Connection error" + (err && err.type ? ` (${err.type})` : "") + ".";
    }
  }

  function cleanName(n) {
    n = String(n || "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 12);
    return n || "Player";
  }

  /* ------------------------------------------------------------ host */
  function host(name) {
    leave();
    isHost = true;
    return new Promise((resolve, reject) => {
      let settled = false;
      const attempt = (n) => {
        code = genCode();
        peer = new Peer(PREFIX + code, { debug: 0 });
        peer.on("open", (id) => {
          myId = id;
          players = [{ id, name: cleanName(name), slot: 0 }];
          settled = true;
          emit("players", players);
          resolve(code);
        });
        peer.on("connection", acceptGuest);
        peer.on("disconnected", () => { if (peer && !peer.destroyed) peer.reconnect(); });
        peer.on("error", (err) => {
          if (!settled && err.type === "unavailable-id" && n < 5) {
            peer.destroy();
            attempt(n + 1);
          } else if (!settled) {
            settled = true;
            leave();
            reject(new Error(errorText(err)));
          } else {
            emit("error", errorText(err));
          }
        });
      };
      attempt(0);
    });
  }

  function acceptGuest(conn) {
    conn.on("data", (d) => {
      if (!d || typeof d !== "object") return;
      if (d.t === "hello") {
        if (locked) return refuse(conn, "Match already in progress. Try again after this round.");
        if (players.length >= MAX_PLAYERS) return refuse(conn, "Room is full (4 players max).");
        const used = players.map((p) => p.slot);
        const slot = [0, 1, 2, 3].find((s) => !used.includes(s));
        conns.set(conn.peer, conn);
        players.push({ id: conn.peer, name: cleanName(d.name), slot });
        conn.send({ t: "welcome", code });
        broadcastPlayers();
        return;
      }
      if (!conns.has(conn.peer)) return;
      d.from = conn.peer;
      for (const [id, c] of conns) if (id !== conn.peer && c.open) c.send(d);
      emit("msg", d);
    });
    conn.on("close", () => dropGuest(conn.peer));
    conn.on("error", () => dropGuest(conn.peer));
  }

  function refuse(conn, reason) {
    try { conn.send({ t: "reject", reason }); } catch (e) {}
    setTimeout(() => conn.close(), 400);
  }

  function dropGuest(id) {
    if (!conns.has(id)) return;
    conns.delete(id);
    players = players.filter((p) => p.id !== id);
    broadcastPlayers();
    emit("left", id);
  }

  function broadcastPlayers() {
    for (const c of conns.values()) if (c.open) c.send({ t: "players", players });
    emit("players", players);
  }

  /* ------------------------------------------------------------ join */
  function join(roomCode, name) {
    leave();
    isHost = false;
    code = String(roomCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (msg) => {
        if (settled) return;
        settled = true;
        leave();
        reject(new Error(msg));
      };
      const timer = setTimeout(() => fail("Couldn't connect to the room. Check the code and try again."), 15000);

      peer = new Peer({ debug: 0 });
      peer.on("open", (id) => {
        myId = id;
        hostConn = peer.connect(PREFIX + code, { reliable: true, serialization: "json" });
        hostConn.on("open", () => hostConn.send({ t: "hello", name: cleanName(name) }));
        hostConn.on("data", (d) => {
          if (!d || typeof d !== "object") return;
          if (d.t === "welcome") {
            clearTimeout(timer);
            settled = true;
            resolve(code);
          } else if (d.t === "reject") {
            clearTimeout(timer);
            fail(d.reason);
          } else if (d.t === "players") {
            players = d.players;
            emit("players", players);
          } else {
            if (!d.from) d.from = PREFIX + code;
            emit("msg", d);
          }
        });
        hostConn.on("close", () => {
          if (settled && peer) {
            leave();
            emit("closed", "The host left the room.");
          }
        });
      });
      peer.on("error", (err) => {
        clearTimeout(timer);
        if (!settled) fail(errorText(err));
        else emit("error", errorText(err));
      });
    });
  }

  /* ------------------------------------------------------------ misc */
  function send(msg) {
    msg.from = myId;
    if (isHost) {
      for (const c of conns.values()) if (c.open) c.send(msg);
    } else if (hostConn && hostConn.open) {
      hostConn.send(msg);
    }
  }

  function leave() {
    if (hostConn) { try { hostConn.close(); } catch (e) {} }
    for (const c of conns.values()) { try { c.close(); } catch (e) {} }
    if (peer) { try { peer.destroy(); } catch (e) {} }
    peer = null;
    hostConn = null;
    conns.clear();
    players = [];
    myId = null;
    code = null;
    locked = false;
  }

  return {
    COLORS,
    MAX_PLAYERS,
    on,
    host,
    join,
    send,
    leave,
    get available() { return typeof Peer !== "undefined"; },
    get connected() { return !!peer && !!myId; },
    get isHost() { return isHost; },
    get code() { return code; },
    get myId() { return myId; },
    get players() { return players; },
    set locked(v) { locked = !!v; },
  };
})();
