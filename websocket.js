(() => {
  const ws = {};
  const urlParams = new URLSearchParams(location.search);
  const roomId = urlParams.get('room') || 'default';

  const socket = io({ transports: ['websocket'] });

  ws.socket = socket;
  ws.roomId = roomId;

  ws.join = (color) => {
    socket.emit('join', { roomId, color });
  };

  ws.on = (event, handler) => socket.on(event, handler);
  ws.emit = (event, payload) => socket.emit(event, payload);

  window.WS = ws;
})();
