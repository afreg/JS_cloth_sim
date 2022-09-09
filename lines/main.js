"use strict";

function main() {
    // Get A WebGL context
    /** @type {HTMLCanvasElement} */
    var canvas = document.querySelector("#canvas");
    var gl = canvas.getContext("webgl");
    if (!gl) {
        return;
    }
    var program;

    // parameters

    const num_vert = 27;
    const side = 200;
    const hook_coef_mult = 0.001;
    const d_t = 0.2;
    //
    const n_lines = ((num_vert - 1) ** 2 * 3 + 2 * (num_vert - 1)) * 2;
    const central_vert = Math.floor((num_vert ** 2 - 1) / 2);

    // cloth physics setup

    var v_ar = [];
    var s_ar = [];
    ClothInit(num_vert, v_ar, s_ar, side, hook_coef_mult);

    // camera
    var camera = [-200, 150, -200];
    const target = [0, 0, 0];
    const up = [0, 1, 0];
    const fieldOfViewRadians = degToRad(50);
    const zNear = 1;
    const zFar = 1000;

    // matrices
    var projectionMatrix = glMatrix.mat4.create();
    var viewMatrix = glMatrix.mat4.create();
    var inverseProjectionMatrix = glMatrix.mat4.create();

    // UI parameters

    var translation = [0, 0, 0];
    var rotation = [degToRad(0), degToRad(0), degToRad(0)];
    var gravity = [0.0, 0.0, 0.0];
    var dissipation = 0.002;
    var amplitude = 10;
    var period = 16;

    // setup UI

    webglLessonsUI.setupSlider("#x", { value: translation[0], slide: updatePosition(0), max: gl.canvas.width });
    webglLessonsUI.setupSlider("#y", { value: translation[1], slide: updatePosition(1), max: gl.canvas.height });
    webglLessonsUI.setupSlider("#z", { value: translation[2], slide: updatePosition(2), max: gl.canvas.height });
    webglLessonsUI.setupSlider("#angleX", { value: radToDeg(rotation[0]), slide: updateRotation(0), max: 360 });
    webglLessonsUI.setupSlider("#angleY", { value: radToDeg(rotation[1]), slide: updateRotation(1), max: 360 });
    webglLessonsUI.setupSlider("#angleZ", { value: radToDeg(rotation[2]), slide: updateRotation(2), max: 360 });
    webglLessonsUI.setupSlider("#gravity", { precision: 1, value: gravity[1], slide: updateGravity(), min: -2, step: 0.2, max: 2 });
    webglLessonsUI.setupSlider("#dissipation", { precision: 3, value: dissipation, slide: updateDissip(), min: 0, step: 0.002, max: 0.1 });
    webglLessonsUI.setupSlider("#amplitude", { value: amplitude, slide: updateAplitude(), max: side / 2 });
    webglLessonsUI.setupSlider("#period", { value: period, slide: updatePeriod(), min: 1, max: 30 });

    // setup UI and utility functions
    function updatePosition(index) {
        return function (event, ui) {
            translation[index] = ui.value;
            calc_matrices();
        };
    }
    function updateRotation(index) {
        return function (event, ui) {
            var angleInDegrees = ui.value;
            var angleInRadians = angleInDegrees * Math.PI / 180;
            rotation[index] = angleInRadians;
            calc_matrices();
        };
    }
    function updateGravity() {
        return function (event, ui) {
            gravity[1] = - ui.value * ClothVertex.mass / 100;
            ClothVertex.st_force = gravity;
        }
    }
    function updateDissip() {
        return function (event, ui) {
            dissipation = ui.value;
        }
    }
    function updateAplitude() {
        return function (event, ui) {
            amplitude = ui.value;
        }
    }
    function updatePeriod() {
        return function (event, ui) {
            period = ui.value;
        }
    }
    function radToDeg(r) {
        return r * 180 / Math.PI;
    }
    function degToRad(d) {
        return d * Math.PI / 180;
    }

    // vertex, selected to be moved by mouse
    var mouse_vertex = {
        index: null,
        start: [0.0, 0.0, 0.0],
        end: [0.0, 0.0, 0.0],
        pr_state: null
    };

    // setup mouse events and functions
    gl.canvas.addEventListener("mousedown", mouseDown, false);
    gl.canvas.addEventListener("mousemove", mouseMove, false);
    gl.canvas.addEventListener("mouseup", mouseUp, false);

    function mouseDown(e) {
        if (0 === e.button) { //left mouse button to drag vertex
            var points_to = get_mouse_vector(e);
            mouse_vertex.index = closest_vertex(points_to.start, points_to.end);
            if (mouse_vertex.index !== null) {
                // pin vertex to mouse
                mouse_vertex.pr_state = v_ar[mouse_vertex.index].is_pinned;
                v_ar[mouse_vertex.index].pin(true);
                mouse_vertex.start = points_to.start;
                mouse_vertex.end = points_to.end;
            }
        }
        else if (1 == e.button && mouse_vertex.index !== null){ //middle mouse button to pi/unpin vertex after drag
            mouse_vertex.pr_state = !mouse_vertex.pr_state;
        }
    }
    function mouseMove(e) {
        if (mouse_vertex.index !== null) {
            var points_to = get_mouse_vector(e);
            var new_pos = d_l_projection(v_ar[mouse_vertex.index].pos, points_to.start, points_to.end);
            v_ar[mouse_vertex.index].move(new_pos);
        }
    }
    function mouseUp(e) {
        if (0 === e.button && mouse_vertex.index !== null) {
            // reset mouse_vertex
            v_ar[mouse_vertex.index].pin(mouse_vertex.pr_state);
            mouse_vertex.index = null;
            mouse_vertex.start = [0.0, 0.0, 0.0];
            mouse_vertex.end = [0.0, 0.0, 0.0];
        }
    }

    // compute vector under mouse cursor
    function get_mouse_vector(e) {
        var rect = canvas.getBoundingClientRect();
        var clipX = (e.clientX - rect.left) / rect.width * 2 - 1;
        var clipY = (e.clientY - rect.top) / rect.height * -2 + 1;
        var start = glMatrix.vec3.create();
        glMatrix.vec3.transformMat4(start, [clipX, clipY, -1], inverseProjectionMatrix);
        var end = glMatrix.vec3.create();
        glMatrix.vec3.transformMat4(end, [clipX, clipY, 1], inverseProjectionMatrix);
        return {
            start: start,
            end: end
        }
    }

    // search for closest to the line [start -> end] vertex
    function closest_vertex(start, end) {
        var closest_distance = side / num_vert;
        var closest_index = v_ar.length;
        for (var i = 0; i < v_ar.length; i++) {
            var dist = distance(v_ar[i].pos, start, end);
            if (dist < closest_distance) {
                closest_distance = dist;
                closest_index = i;
            }
        }
        if (closest_index === v_ar.length) { return null }
        else { return closest_index };
    }

    // calculate distance between vertex dot and line [start -> end]
    function distance(dot, start, end) {
        var r = glMatrix.vec3.create();
        var v = glMatrix.vec3.create();
        glMatrix.vec3.subtract(r, dot, start);
        glMatrix.vec3.subtract(v, end, start);
        glMatrix.vec3.normalize(v, v);
        glMatrix.vec3.cross(r, r, v);
        return glMatrix.vec3.length(r);
    }

    // calculete projection of a dot on a line [start -> end]
    function d_l_projection(dot, start, end) {
        var r = glMatrix.vec3.create(); // radius-vector dot_on_line -> dot
        var s = glMatrix.vec3.create(); // line direction
        var d = glMatrix.vec3.create(); // -delta position
        var out = glMatrix.vec3.create();
        glMatrix.vec3.subtract(r, start, dot);
        glMatrix.vec3.subtract(s, end, start);
        var m = glMatrix.vec3.dot(r, s) / glMatrix.vec3.squaredLength(s); // movement along the line
        glMatrix.vec3.scale(d, s, m);
        glMatrix.vec3.subtract(out, start, d);
        return out;
    }

    // setup GL program
    set_program();

    // Buffers
    var positionBuffer = gl.createBuffer();
    var colorBuffer = gl.createBuffer();

    var now = 0;
    calc_matrices();
    requestAnimationFrame(drawScene);

    // Draw the scene.
    function drawScene() {
        // update cloth state
        // Central point movement
        now += d_t;
        var c_pos = v_ar[central_vert].pos;
        v_ar[central_vert].move([c_pos[0], amplitude * Math.sin(now / period), c_pos[2]]);
        ClothUpdate(v_ar, s_ar, d_t);

        // calculate webGL new data
        reset_webGL();
        set_buffers();
        set_matrices();

        // draw
        gl.drawArrays(gl.LINES, 0, n_lines);

        // next scene
        requestAnimationFrame(drawScene);
    }
    // reset graphics for the next scene drawing
    function reset_webGL() {
        // resize canvas if needed
        if (canvas.width !== gl.canvas.clientWidth || canvas.height !== gl.canvas.clientHeight) {
            gl.canvas.width = gl.canvas.clientWidth;
            gl.canvas.height = gl.canvas.clientHeight;
        }
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(program);
    }
    // set uniform matrices
    function set_matrices() {
        gl.uniformMatrix4fv(program.worldViewProjectionLocation, false, viewMatrix);
    }
    // calculate reltions matrices
    function calc_matrices() {
        // Compute the projection matrix
        var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        glMatrix.mat4.perspectiveNO(projectionMatrix, fieldOfViewRadians, aspect, zNear, zFar);

        // Compute the view projection matrix
        glMatrix.mat4.targetTo(viewMatrix, camera, target, up); //camera
        glMatrix.mat4.invert(viewMatrix, viewMatrix); //view
        glMatrix.mat4.multiply(viewMatrix, projectionMatrix, viewMatrix);

        // Compute the world matrix
        glMatrix.mat4.translate(viewMatrix, viewMatrix, translation);
        glMatrix.mat4.rotateX(viewMatrix, viewMatrix, rotation[0]);
        glMatrix.mat4.rotateY(viewMatrix, viewMatrix, rotation[1]);
        glMatrix.mat4.rotateZ(viewMatrix, viewMatrix, rotation[2]);

        // Compute the inverse matrix
        glMatrix.mat4.invert(inverseProjectionMatrix, viewMatrix);

        // var dot_pos0 = glMatrix.vec3.create();
        // var dot_pos1 = glMatrix.vec3.create();
        // var dot_pos2 = glMatrix.vec3.create();
        // var dot_pos3 = glMatrix.vec3.create();
        // glMatrix.vec3.transformMat4(dot_pos0, v_ar[0].pos, viewMatrix);
        // glMatrix.vec3.transformMat4(dot_pos1, v_ar[num_vert - 1].pos, viewMatrix);
        // glMatrix.vec3.transformMat4(dot_pos2, v_ar[num_vert * (num_vert - 1)].pos, viewMatrix);
        // glMatrix.vec3.transformMat4(dot_pos3, v_ar[num_vert ** 2 - 1].pos, viewMatrix);
        // console.log([dot_pos0, dot_pos1, dot_pos2, dot_pos3]);
    }
    // set buffer data and associations
    function set_buffers() {
        var geom = get_line_geometry(v_ar, s_ar, num_vert);

        // Position attribute from buffer
        gl.enableVertexAttribArray(program.positionLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geom.vertices), gl.STATIC_DRAW);
        gl.vertexAttribPointer(program.positionLocation, 3, gl.FLOAT, false, 0, 0);

        // Color attribute from buffer
        gl.enableVertexAttribArray(program.colorLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geom.colors), gl.STATIC_DRAW);
        gl.vertexAttribPointer(program.colorLocation, 4, gl.FLOAT, false, 0, 0);
    }
    // set shaders, program and attributes
    function set_program() {
        // get shaders
        var fragmentShader = get_shader(gl.FRAGMENT_SHADER, 'fragment-shader-3d');
        var vertexShader = get_shader(gl.VERTEX_SHADER, 'vertex-shader-3d');
        // create program and attach shaders
        program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);

        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            alert("***Error: failed to attach shaders");
        }
        gl.useProgram(program);

        // look up where the vertex data needs to go.
        program.positionLocation = gl.getAttribLocation(program, "a_position");
        program.colorLocation = gl.getAttribLocation(program, "a_color");

        // lookup uniforms
        program.worldViewProjectionLocation = gl.getUniformLocation(program, "u_worldViewProjection");

        return program;
    }
    // create shaders from script
    function get_shader(type, id) {
        var source = document.getElementById(id).innerHTML;
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            alert("***Error failed to compile shader: " + gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }
}


main();
