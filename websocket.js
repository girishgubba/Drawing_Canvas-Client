(() => {
  const ws = {};
  const urlParams = new URLSearchParams(location.search);
  const roomId = urlParams.get('room') || 'default';

  //The socket.io URL here
  const BACKEND_URL = "https://drawing-canvas-server.onrender.com";

  const socket = io(BACKEND_URL, { transports: ['websocket'] });

  ws.socket = socket;
  ws.roomId = roomId;

  ws.join = (color) => {
    socket.emit('join', { roomId, color });
  };

  ws.on = (event, handler) => socket.on(event, handler);
  ws.emit = (event, payload) => socket.emit(event, payload);

  window.WS = ws;
})();
