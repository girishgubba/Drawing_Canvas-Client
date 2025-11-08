(() => {
  const randomColor = () => {
    // choosing random color
    const hues = [200, 220, 260, 300, 340, 20, 40, 160];
    const h = hues[Math.floor(Math.random()*hues.length)];
    return `hsl(${h} 80% 45%)`;
  };
  const myColor = randomColor();
  document.getElementById('color').value = '#1f6feb'; // default is brush

  window.addEventListener('load', () => {
    canvasInit(myColor);
  });
})();