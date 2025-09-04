document.addEventListener("DOMContentLoaded", () => {
  // Select all sections
  const sections = document.querySelectorAll("main section");

  // Intersection Observer for Revealing Sections
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");

          // Animate Text Letters with Pop-In Effect
          const heading = entry.target.querySelector("h2");
          if (heading) {
            const letters = heading.innerText.split("").map((letter) => {
              const span = document.createElement("span");
              span.textContent = letter === " " ? "\u00A0" : letter;
              span.style.display = "inline-block";
              span.style.opacity = "0";
              span.style.transform = `scale(0) rotate(${Math.random() * 360}deg)`;
              span.style.transition = `opacity 0.6s ease, transform 0.6s ease`;
              return span;
            });

            heading.innerHTML = "";
            letters.forEach((letter, index) => {
              setTimeout(() => {
                letter.style.opacity = "1";
                letter.style.transform = "scale(1) rotate(0)";
                heading.appendChild(letter);
              }, index * 50);
            });
          }
        }
      });
    },
    { threshold: 0.3 }
  );

  sections.forEach((section) => observer.observe(section));

  // Morphing Shapes Interactive Background
  const canvas = document.createElement("canvas");
  canvas.id = "morphingCanvas";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const shapes = Array.from({ length: 12 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 100 + 50,
    dx: Math.random() * 2 - 1,
    dy: Math.random() * 2 - 1,
    angle: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.02,
    gradient: createDynamicGradient(),
  }));

  function createDynamicGradient() {
    const gradient = ctx.createLinearGradient(0, 0, 100, 100);
    gradient.addColorStop(0, `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.8)`);
    gradient.addColorStop(1, `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.3)`);
    return gradient;
  }

  const drawShapes = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    shapes.forEach((shape) => {
      ctx.save();
      ctx.translate(shape.x, shape.y);
      ctx.rotate(shape.angle);

      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const x = shape.size * Math.cos((i * Math.PI * 2) / 6);
        const y = shape.size * Math.sin((i * Math.PI * 2) / 6);
        ctx.lineTo(x, y);
      }
      ctx.closePath();

      ctx.fillStyle = shape.gradient;
      ctx.fill();

      ctx.restore();

      // Update Shape Position and Rotation
      shape.x += shape.dx;
      shape.y += shape.dy;
      shape.angle += shape.rotationSpeed;

      // Keep shapes within canvas bounds
      if (shape.x < -shape.size) shape.x = canvas.width + shape.size;
      if (shape.x > canvas.width + shape.size) shape.x = -shape.size;
      if (shape.y < -shape.size) shape.y = canvas.height + shape.size;
      if (shape.y > canvas.height + shape.size) shape.y = -shape.size;
    });
  };

  const animateShapes = () => {
    drawShapes();
    requestAnimationFrame(animateShapes);
  };

  animateShapes();

  // Balanced Depth Effect on Mouse Movement
  window.addEventListener("mousemove", (e) => {
    const dx = (e.clientX - canvas.width / 2) / 50;
    const dy = (e.clientY - canvas.height / 2) / 50;
    shapes.forEach((shape) => {
      shape.dx += dx * 0.005;
      shape.dy += dy * 0.005;
    });
  });

  // Resize Canvas on Window Resize
  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  // Shape Hover Effect
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    shapes.forEach((shape) => {
      const distance = Math.hypot(mouseX - shape.x, mouseY - shape.y);
      if (distance < shape.size / 2) {
        shape.size += 2;
      } else {
        shape.size = Math.max(50, shape.size - 0.5);
      }
    });
  });
});
