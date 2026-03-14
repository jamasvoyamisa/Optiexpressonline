// Aurora effect using WebGL
class Aurora {
  constructor(container, options = {}) {
    this.container = container;
    this.colorStops = options.colorStops || ['#006188', '#00B3CD', '#D8E0EA'];
    this.blend = options.blend || 0.5;
    this.amplitude = options.amplitude || 1.0;
    this.speed = options.speed || 1.2;
    this.time = 0;
    
    this.init();
  }

  init() {
    const canvas = document.createElement('canvas');
    this.gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    
    if (!this.gl) {
      console.error('WebGL not supported');
      return;
    }

    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '-1';
    canvas.style.pointerEvents = 'none';
    
    this.container.appendChild(canvas);
    this.canvas = canvas;
    
    this.setupShaders();
    this.setupGeometry();
    this.resize();
    this.animate();
    
    window.addEventListener('resize', () => this.resize());
  }

  setupShaders() {
    const vert = `#version 300 es
      in vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const frag = `#version 300 es
      precision highp float;
      
      uniform float uTime;
      uniform float uAmplitude;
      uniform vec3 uColorStops[3];
      uniform vec2 uResolution;
      uniform float uBlend;
      
      out vec4 fragColor;
      
      vec3 permute(vec3 x) {
        return mod(((x * 34.0) + 1.0) * x, 289.0);
      }
      
      float snoise(vec2 v){
        const vec4 C = vec4(
            0.211324865405187, 0.366025403784439,
            -0.577350269189626, 0.024390243902439
        );
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod(i, 289.0);
      
        vec3 p = permute(
            permute(i.y + vec3(0.0, i1.y, 1.0))
          + i.x + vec3(0.0, i1.x, 1.0)
        );
      
        vec3 m = max(
            0.5 - vec3(
                dot(x0, x0),
                dot(x12.xy, x12.xy),
                dot(x12.zw, x12.zw)
            ), 
            0.0
        );
        m = m * m;
        m = m * m;
      
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }
      
      void main() {
        vec2 uv = gl_FragCoord.xy / uResolution;
        
        vec3 rampColor;
        float factor = uv.x;
        if (factor < 0.5) {
          float t = factor / 0.5;
          rampColor = mix(uColorStops[0], uColorStops[1], t);
        } else {
          float t = (factor - 0.5) / 0.5;
          rampColor = mix(uColorStops[1], uColorStops[2], t);
        }
        
        float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
        height = exp(height);
        height = (uv.y * 2.0 - height + 0.2);
        float intensity = 0.6 * height;
        
        float midPoint = 0.20;
        float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);
        
        vec3 auroraColor = intensity * rampColor;
        
        fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
      }
    `;

    this.program = this.createProgram(vert, frag);
    this.gl.useProgram(this.program);
    
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.clearColor(0, 0, 0, 0);
  }

  createProgram(vertexSource, fragmentSource) {
    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource);
    
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('Program link error:', this.gl.getProgramInfoLog(program));
      return null;
    }
    
    return program;
  }

  createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16) / 255.0,
      parseInt(result[2], 16) / 255.0,
      parseInt(result[3], 16) / 255.0
    ] : [0, 0, 0];
  }

  setupGeometry() {
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

    const positionLocation = this.gl.getAttribLocation(this.program, 'position');
    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);
  }

  resize() {
    const width = this.container.offsetWidth || window.innerWidth;
    const height = this.container.offsetHeight || window.innerHeight;
    
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    
    const resolutionLocation = this.gl.getUniformLocation(this.program, 'uResolution');
    this.gl.uniform2f(resolutionLocation, width, height);
  }

  animate() {
    this.time += 0.01 * this.speed;
    
    const timeLocation = this.gl.getUniformLocation(this.program, 'uTime');
    const amplitudeLocation = this.gl.getUniformLocation(this.program, 'uAmplitude');
    const blendLocation = this.gl.getUniformLocation(this.program, 'uBlend');
    
    this.gl.uniform1f(timeLocation, this.time);
    this.gl.uniform1f(amplitudeLocation, this.amplitude);
    this.gl.uniform1f(blendLocation, this.blend);
    
    const colorStopsLocation = this.gl.getUniformLocation(this.program, 'uColorStops');
    const colorArray = [];
    this.colorStops.forEach(color => {
      const rgb = this.hexToRgb(color);
      colorArray.push(...rgb);
    });
    this.gl.uniform3fv(colorStopsLocation, colorArray);
    
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    
    requestAnimationFrame(() => this.animate());
  }
}

// Clase Aurora invertida para el footer (ondas hacia arriba)
class AuroraInverted extends Aurora {
  setupShaders() {
    const vert = `#version 300 es
      in vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const frag = `#version 300 es
      precision highp float;
      
      uniform float uTime;
      uniform float uAmplitude;
      uniform vec3 uColorStops[3];
      uniform vec2 uResolution;
      uniform float uBlend;
      
      out vec4 fragColor;
      
      vec3 permute(vec3 x) {
        return mod(((x * 34.0) + 1.0) * x, 289.0);
      }
      
      float snoise(vec2 v){
        const vec4 C = vec4(
            0.211324865405187, 0.366025403784439,
            -0.577350269189626, 0.024390243902439
        );
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod(i, 289.0);
      
        vec3 p = permute(
            permute(i.y + vec3(0.0, i1.y, 1.0))
          + i.x + vec3(0.0, i1.x, 1.0)
        );
      
        vec3 m = max(
            0.5 - vec3(
                dot(x0, x0),
                dot(x12.xy, x12.xy),
                dot(x12.zw, x12.zw)
            ), 
            0.0
        );
        m = m * m;
        m = m * m;
      
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }
      
      void main() {
        vec2 uv = gl_FragCoord.xy / uResolution;
        
        vec3 rampColor;
        float factor = uv.x;
        if (factor < 0.5) {
          float t = factor / 0.5;
          rampColor = mix(uColorStops[0], uColorStops[1], t);
        } else {
          float t = (factor - 0.5) / 0.5;
          rampColor = mix(uColorStops[1], uColorStops[2], t);
        }
        
        // Ondas invertidas hacia arriba: invertir Y y cambiar dirección del tiempo
        float height = snoise(vec2(uv.x * 2.0 - uTime * 0.1, -uTime * 0.25)) * 0.5 * uAmplitude;
        height = exp(height);
        float invertedY = 1.0 - uv.y; // Invertir coordenada Y
        height = (invertedY * 2.0 - height + 0.2);
        float intensity = 0.6 * height;
        
        float midPoint = 0.20;
        float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);
        
        vec3 auroraColor = intensity * rampColor;
        
        fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
      }
    `;

    this.program = this.createProgram(vert, frag);
    this.gl.useProgram(this.program);
    
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.clearColor(0, 0, 0, 0);
  }
}

// Initialize Aurora when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Aurora para el fondo principal
  const auroraContainer = document.createElement('div');
  auroraContainer.style.position = 'absolute';
  auroraContainer.style.top = '0';
  auroraContainer.style.left = '0';
  auroraContainer.style.width = '100%';
  auroraContainer.style.height = '100%';
  auroraContainer.style.zIndex = '-1';
  auroraContainer.style.pointerEvents = 'none';
  
  document.body.appendChild(auroraContainer);
  
  // Asegurar que el contenedor tenga la altura completa del documento
  const updateHeight = () => {
    auroraContainer.style.height = Math.max(document.documentElement.scrollHeight, window.innerHeight) + 'px';
  };
  updateHeight();
  window.addEventListener('resize', updateHeight);
  window.addEventListener('scroll', updateHeight);
  
  new Aurora(auroraContainer, {
    colorStops: ['#006188', '#00B3CD', '#D8E0EA'],
    blend: 0.5,
    amplitude: 1.0,
    speed: 1.2
  });
  
  // Aurora invertida para el footer
  const footer = document.querySelector('.footer');
  if (footer) {
    const footerAuroraContainer = document.createElement('div');
    footerAuroraContainer.style.position = 'absolute';
    footerAuroraContainer.style.top = '0';
    footerAuroraContainer.style.left = '0';
    footerAuroraContainer.style.width = '100%';
    footerAuroraContainer.style.height = '100%';
    footerAuroraContainer.style.zIndex = '0';
    footerAuroraContainer.style.pointerEvents = 'none';
    
    footer.style.position = 'relative';
    footer.appendChild(footerAuroraContainer);
    
    const updateFooterHeight = () => {
      footerAuroraContainer.style.height = footer.offsetHeight + 'px';
    };
    updateFooterHeight();
    window.addEventListener('resize', updateFooterHeight);
    
    new AuroraInverted(footerAuroraContainer, {
      colorStops: ['#006188', '#00B3CD', '#D8E0EA'],
      blend: 0.5,
      amplitude: 1.0,
      speed: 1.2
    });
  }
});
