"use strict";

function main() {
    // Get A WebGL context
    /** @type {HTMLCanvasElement} */
    var canvas = document.querySelector("#canvas");
    var gl = canvas.getContext("webgl");
    if (!gl) {
        return;
    }

    // parameters

    const num_vert = 27;
    const side = 200;
    const hook_coef_mult = 0.001;
    const d_t = 0.2;
    //
    const n_lines = ((num_vert - 1) ** 2 * 3 + 2 * (num_vert - 1)) * 3;
    const central_vert = Math.floor((num_vert ** 2 - 1) / 2);

    // cloth physics setup

    var v_ar = [];
    var s_ar = [];
    ClothInit(num_vert, v_ar, s_ar, side, hook_coef_mult);

    // UI parameters

    const fieldOfViewRadians = degToRad(62);
    var translation = [0, 34, 150];
    var rotation = [degToRad(180), degToRad(310), degToRad(0)];
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

    // setup GLSL program
    var program = webglUtils.createProgramFromScripts(gl, ["vertex-shader-3d", "fragment-shader-3d"]);

    // look up where the vertex data needs to go.
    var positionLocation = gl.getAttribLocation(program, "a_position");
    var colorLocation = gl.getAttribLocation(program, "a_color");

    // lookup uniforms
    var worldViewProjectionLocation = gl.getUniformLocation(program, "u_worldViewProjection");
    var worldInverseTransposeLocation = gl.getUniformLocation(program, "u_worldInverseTranspose");

    // Buffers
    var positionBuffer = gl.createBuffer();
    var colorBuffer = gl.createBuffer();

    // matrices
    var projectionMatrix = glMatrix.mat4.create();
    var viewMatrix = glMatrix.mat4.create();
    var worldMatrix = glMatrix.mat4.create();
    var worldViewProjectionMatrix = glMatrix.mat4.create();
    var worldInverseTransposeMatrix = glMatrix.mat4.create();

    var now = 0;
    calc_matrices();
    requestAnimationFrame(drawScene);

    // Draw the scene.
    function drawScene() {
        // Central point movement
        now += d_t;
        var c_pos = v_ar[central_vert].pos;
        v_ar[central_vert].move([c_pos[0], amplitude * Math.sin(now / period), c_pos[2]]);
        // update cloth state
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
    // ???
    function reset_webGL() {
        webglUtils.resizeCanvasToDisplaySize(gl.canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);

        gl.useProgram(program);
    }
    // set uniform matrices
    function set_matrices() {
        gl.uniformMatrix4fv(worldViewProjectionLocation, false, worldViewProjectionMatrix);
        gl.uniformMatrix4fv(worldInverseTransposeLocation, false, worldInverseTransposeMatrix);
    }
    // calculate reltions matrices
    function calc_matrices() {
        // Compute the projection matrix
        var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        var zNear = 1;
        var zFar = 600;
        glMatrix.mat4.perspectiveNO(projectionMatrix, fieldOfViewRadians, aspect, zNear, zFar);

        // Compute the view projection matrix
        var camera = [100, 150, 200];
        var target = [0, 35, 0];
        var up = [0, 1, 0];
        glMatrix.mat4.targetTo(viewMatrix, camera, target, up); //camera
        glMatrix.mat4.invert(viewMatrix, viewMatrix); //view
        glMatrix.mat4.multiply(viewMatrix, projectionMatrix, viewMatrix);

        // Compute the world matrix
        glMatrix.mat4.fromTranslation(worldMatrix, translation);
        glMatrix.mat4.rotateX(worldMatrix, worldMatrix, rotation[0]);
        glMatrix.mat4.rotateY(worldMatrix, worldMatrix, rotation[1]);
        glMatrix.mat4.rotateZ(worldMatrix, worldMatrix, rotation[2]);

        // Multiply the matrices.
        glMatrix.mat4.multiply(worldViewProjectionMatrix, viewMatrix, worldMatrix);
        glMatrix.mat4.invert(worldInverseTransposeMatrix, worldMatrix);
        glMatrix.mat4.transpose(worldInverseTransposeMatrix, worldInverseTransposeMatrix);
    }
    // set buffer data and associations
    function set_buffers() {
        var geom = get_line_geometry(v_ar, s_ar, num_vert);

        // Position attribute from buffer
        gl.enableVertexAttribArray(positionLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geom.vertices), gl.STATIC_DRAW);
        gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

        // Color attribute from buffer
        gl.enableVertexAttribArray(colorLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geom.colors), gl.STATIC_DRAW);
        gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);
    }
}


main();
