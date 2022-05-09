let WIDTH;
let HEIGHT;
let controls = {};
let refresh = false;

//TODO values in GLSL come from uniforms
//TODO error check random
function initInput(name, defaultValue) {
  controls[name] = defaultValue;
  let element = document.querySelector(`#${name}`);
  if (element) {
    element.value = controls[name];
    element.nextElementSibling.textContent = controls[name];

    element.addEventListener("input", function () {
      this.nextElementSibling.textContent = this.value;
    });

    element.addEventListener("change", (event) => {
      console.log(`changed value of ${name} to ${event.target.value}`);
      refresh = true;
    });
  }
}

function linkControls() {
  const defaults = [
    {name: "numCircles", value: 10},
    {name: "circleMinR", value: 0.02},
    {name: "circleMaxR", value: 0.17},
    {name: "threshold", value: 1.0},
    {name: "padding", value: 30},
    {name: "minVX", value: 1},
    {name: "maxVX", value: 6},
    {name: "minVY", value: 1},
    {name: "maxVY", value: 6},
  ];

  defaults.forEach((element) => {
    initInput(element.name, element.value);
  });
}

/** Render canvas when the DOM is loaded and parsed */
document.addEventListener("DOMContentLoaded", () => {
  linkControls();
  // Get WebGL context from canvas
  canvas = document.querySelector("#mainCanvas");
  WIDTH = Math.floor(canvas.offsetWidth * window.devicePixelRatio);
  HEIGHT = Math.floor(canvas.offsetHeight * window.devicePixelRatio);
  //TODO better adjustment than this....
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  canvas.addEventListener("click", (event) => {
    console.log(event);
  });

  const gl = canvas.getContext("webgl");

  if (!gl) {
    throw new Error("ERROR: browser does not support WebGL");
  }

  // vertex and fragment shader code
  const vertexCode = `   
    precision highp float;     
    attribute vec2 vertPosition;
    
    void main()
    {
      gl_Position = vec4(vertPosition, 0.0, 1.0);
    }`;

  const fragmentCode = `  
    precision highp float;   
    const int num = ${controls.numCircles};
    uniform vec3 circles[num];
    
    
    void main()
    {
      float x = gl_FragCoord.x;
      float y = gl_FragCoord.y;
      float v = 0.0;

      for (int i = 0; i < num; i++) {
        vec3 circle = circles[i];
        float dx = circle.x - x;
        float dy = circle.y - y;
        float r = circle.z;
        v += r*r/(dx*dx + dy*dy);
      }
      if (v > ${Number.isInteger(controls.threshold) ? controls.threshold + ".0" : controls.threshold}) {
          gl_FragColor = vec4(x/${WIDTH}.0, y/${HEIGHT}.0, 0.5, 1.0);
      } else {
          gl_FragColor = vec4(0.9, 0.9, 0.9, 1.0);
      }
    }`;

  // create program by creating shaders from code, attaching
  // the shaders to the program and linking the program
  const program = makeProgramFromStrings(gl, [vertexCode, fragmentCode]);

  // Get data ready to transfer to graphics card

  // Set up buffer data and associated attributes
  // prettier-ignore
  const bufferData = new Float32Array([
    // X, Y,       R, G, B
      -1.0,  1.0,  // top left
      -1.0, -1.0,  // bottom left 
       1.0,  1.0,  // top right
       1.0, -1.0,  // bottom right
  ]);

  const attributes = new Array(
    // vertPosition is 2 elements in a 2 element vertex of type float
    createAttribute("vertPosition", 2, 2, gl.FLOAT)
  );

  // Create buffer from buffer data and attributes
  createBuffer(gl, program, bufferData, attributes);

  gl.useProgram(program);

  // generate circles
  let circles = generateCircles();

  const uniformLocation = gl.getUniformLocation(program, "circles");

  /**
   * Simulation step, data transfer, and drawing
   */

  const step = function () {
    if (refresh) {
      refresh = false;
      circles = generateCircles();
    } else {
      // Update positions and speeds
      for (let i = 0; i < circles.length; i++) {
        const circle = circles[i];

        circle.x += circle.vx;
        circle.y += circle.vy;

        // not inside x bounds
        if (circle.x - circle.r < controls.padding || circle.x + circle.r > WIDTH - controls.padding) {
          // change direction
          circle.vx *= -1;
        }

        // not inside y bounds
        if (circle.y - circle.r < controls.padding || circle.y + circle.r > HEIGHT - controls.padding) {
          // change direction
          circle.vy *= -1;
        }
      }
    }

    // convert to uniform data
    const uniformData = generateUniformData(circles);

    gl.uniform3fv(uniformLocation, uniformData);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(step);
  };

  step();
});

/**
 * Create and compile a shader from GLSL source code string
 *
 * @param {!WebGLRenderingContext } gl The current WebGL rendering context
 * @param {!string} shaderSource The shader source code text in GLSL
 * @param {!number} shaderType The type of shader to create, either gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
 * @throws {Error} If shader cannot be compiled
 * @returns {!WebGLShader} The compiled shader
 */
function makeShader(gl, shaderSource, shaderType) {
  const shader = gl.createShader(shaderType);
  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(
      `ERROR compiling ${shaderType === gl.VERTEX_SHADER ? "vertex" : "fragment"} shader: ${gl.getShaderInfoLog(
        shader
      )}`
    );
  }
  return shader;
}

/**
 * Create a WebGLProgram, attach a vertex and a fragment shader,
 * then link the program, with the option to validate the program.
 *
 * @param {!WebGLRenderingContext } gl The current WebGL rendering context
 * @param {!WebGLShader} vertexShader A compiled vertex shader
 * @param {!WebGLShader} fragmentShader A compiled fragment shader
 * @param {boolean} validate If true, will validate the program before returning it
 * @throws {Error} If program can't be linked
 * @throws {Error} If validate is true and the program can't be validated
 * @returns {!WebGLProgram}
 */
function makeProgram(gl, vertexShader, fragmentShader, validate = false) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("ERROR linking program: " + gl.getProgramInfoLog(program));
  }
  if (validate) {
    gl.validateProgram(program);
    if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
      throw new Error("ERROR validating program: " + gl.getProgramInfoLog(program));
    }
  }

  return program;
}

/**
 * Create a WebGL program from 2 strings containing GLSL code.
 *
 * @param {!WebGLRenderingContext} gl The WebGL Context.
 * @param {string[]} shaderCode Array of GLSL code for the shaders. The first is assumed to be the
 *        vertex shader, the second the fragment shader.
 * @return {!WebGLProgram} A program
 */
function makeProgramFromStrings(gl, shaderCode) {
  const vertexShader = makeShader(gl, shaderCode[0], gl.VERTEX_SHADER);

  const fragmentShader = makeShader(gl, shaderCode[1], gl.FRAGMENT_SHADER);

  return makeProgram(gl, vertexShader, fragmentShader);
}

/**
 * Create an attribute object from the parameters
 *
 * @param {string} name The attribute (variable) name that will be accessed in the GLSL code
 * @param {number} numElements The number of elements for this attribute. Must be 1, 2, 3, or 4.
 * @param {number} numVertex  Number elements in the full vertex
 * @param {string} type Data type of each component: gl.BYTE, gl.SHORT, gl.UNSIGNED_BYTE, gl.UNSIGNED_SHORT, gl.FLOAT
 * @param {number} offset  Offset of this attribute in the full vertex
 * @param {number} typeSize size of the data type
 * @param {boolean} normalized If true, integer data values normalized when being cast to a float
 * @returns {AttributeObject} An attribute object used in the {@link createBuffer} to set the attribute pointed
 */
function createAttribute(
  name,
  numElements,
  numVertex,
  type,
  offset = 0,
  typeSize = Float32Array.BYTES_PER_ELEMENT,
  normalized = false
) {
  return {
    name: name,
    size: numElements,
    stride: numVertex * typeSize,
    offset: offset * typeSize,
    type: type,
    normalized: normalized,
  };
}

/**
 * Create a buffer from the buffer data and configure attributes
 *
 * @param {!WebGLRenderingContext } gl The current WebGL rendering context
 * @param {!WebGLProgram} program The WebGL complied and linked program
 * @param {!Float32Array} bufferData An array of elements
 * @param {!Array<AttributeObject>} attributes Attribute descriptions generated from {@link createAttribute}
 * @param {number} type Buffer type from a GLenum; default is gl.ARRAY_BUFFER
 * @param {number} bufferDataType Buffer data type from a GLenum; default is gl.STATIC_DRAW
 */
function createBuffer(gl, program, bufferData, attributes, type = gl.ARRAY_BUFFER, bufferDataType = gl.STATIC_DRAW) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(type, buffer);
  gl.bufferData(type, bufferData, bufferDataType);

  attributes.forEach((attr) => {
    const attrLocation = gl.getAttribLocation(program, attr.name);
    if (attrLocation === -1) {
      throw "Can not find attribute " + attr.name + "#";
    }

    gl.vertexAttribPointer(attrLocation, attr.size, attr.type, attr.normalized, attr.stride, attr.offset);
    gl.enableVertexAttribArray(attrLocation);
  });
}

/**
 * Clear the canvas with the given color
 * @param {WebGLRenderingContext} gl The current WebGL rendering context
 * @param {ColorObject} color Contains floats for r, g, b, and a
 */
function clearCanvas(gl, color) {
  gl.clearColor(color.r, color.g, color.b, color.a);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

/**
 * Generates a requested number of random circles. Given sizeLimit is
 * the smaller dimension of canvas width and height, the the max
 * radius equals 1/radiusLimits.max * sizeLimit and the min radius is
 * 1/radiusLimits.min * sizeLimit
 * @returns {Array} Of circle info, x, y, vx, vy, r
 */
function generateCircles() {
  const circles = [];
  const sizeLimit = WIDTH < HEIGHT ? WIDTH : HEIGHT;

  const MIN_RADIUS = sizeLimit * controls.circleMinR;
  const MAX_RADIUS = sizeLimit * controls.circleMaxR;

  for (let i = 0; i < controls.numCircles; i++) {
    const radius = random(MIN_RADIUS, MAX_RADIUS);

    circles.push({
      x: random(controls.padding + radius, WIDTH - controls.padding - radius),
      y: random(controls.padding + radius, HEIGHT - controls.padding - radius),
      vx: random(controls.minVX, controls.maxVX),
      vy: random(controls.minVY, controls.maxVY),
      r: radius,
    });
  }

  return circles;
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}
/**
 * given generated circles, returns array of data for uniform
 * @param {Array} circles The circle data
 * @returns {Float32Array} Of circle info, (x, y) = center, z = radius
 */
function generateUniformData(circles) {
  // number of circle elements to put in uniform
  const CIRCLE_ELEMENTS = 3;
  const uniformData = new Float32Array(CIRCLE_ELEMENTS * circles.length);
  for (let i = 0; i < circles.length; i++) {
    const baseIndex = CIRCLE_ELEMENTS * i;
    const circle = circles[i];
    uniformData[baseIndex + 0] = circle.x;
    uniformData[baseIndex + 1] = circle.y;
    uniformData[baseIndex + 2] = circle.r;
  }

  return uniformData;
}

/**
 * Description of color object for WebGL color
 *
 * @typedef {object} ColorObject
 * @property {number} red Value of red from 0.0 to 1.0
 * @property {number} green Value of green from 0.0 to 1.0
 * @property {number} blue Value of blue from 0.0 to 1.0
 * @property {number} alpha Value of alpha from 0.0 to 1.0
 */

/**
 * Description of attribute object
 *
 * @typedef {object} AttributeObject
 * @property {string} name the name of the attribute to be used in the GLSL code
 * @property {number} size the number of elements for this attribute; must be 1,2,3, or 4
 * @property {number} stride the size in bytes of one full vertex
 * @property {number} offset the offset in bytes of this attribute in the full vertex
 * @property {number} type Data type of each component: gl.BYTE, gl.SHORT, gl.UNSIGNED_BYTE, gl.UNSIGNED_SHORT, gl.FLOAT
 * @property {boolean} normalized If true, integer data values normalized when being cast to a float
 */
