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

    var num_vert = 27;
    var side = 200;
    var hook_coef_mult = 0.001;
    console.log('+ parameters');

    // cloth physics setup

    var v_ar = [];
    var s_ar = [];
    ClothInit(num_vert, v_ar, s_ar, side, hook_coef_mult);
    console.log('+ physics');

    // UI parameters

    var fieldOfViewRadians = degToRad(60);
    var translation = [0, 50, 0];
    var rotation = [degToRad(180), degToRad(180), degToRad(0)];
    var gravity = [0.0, 0.0, 0.0];
    var dissipation = 0.002;
    var amplitude = 10;
    var period = 16;

    console.log('+ UI parameters');

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
    console.log('+ UI');

    // setup UI functions

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
    console.log('+ UI functions');

    // setup GLSL program
    var program = webglUtils.createProgramFromScripts(gl, ["vertex-shader-3d", "fragment-shader-3d"]);

    // look up where the vertex data needs to go.
    var positionLocation = gl.getAttribLocation(program, "a_position");
    var normalLocation = gl.getAttribLocation(program, "a_normal");
    var colorLocation = gl.getAttribLocation(program, "a_color");

    // lookup uniforms
    var worldViewProjectionLocation = gl.getUniformLocation(program, "u_worldViewProjection");
    var worldInverseTransposeLocation = gl.getUniformLocation(program, "u_worldInverseTranspose");
    var reverseLightDirectionLocation =
        gl.getUniformLocation(program, "u_reverseLightDirection");

    var geom = get_geometry(v_ar, s_ar, num_vert);
    // Create a buffer to put positions in
    var positionBuffer = gl.createBuffer();
    // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    // Put geometry data into buffer
    var pos = setGeometry(geom.vertices);

    // Create a buffer to put colors in
    var colorBuffer = gl.createBuffer();
    // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = colorBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    // Put color data into buffer
    setColors(geom.colors);

    // Create a buffer to put normals in
    var normalBuffer = gl.createBuffer();
    // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = normalBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    // Put normals data into buffer
    setNormals(pos);

    function radToDeg(r) {
        return r * 180 / Math.PI;
    }

    function degToRad(d) {
        return d * Math.PI / 180;
    }

    // matrices
    var projectionMatrix = glMatrix.mat4.create();
    var viewMatrix = glMatrix.mat4.create();
    var worldMatrix = glMatrix.mat4.create();
    var worldViewProjectionMatrix = glMatrix.mat4.create();
    var worldInverseTransposeMatrix = glMatrix.mat4.create();

    var fieldOfViewRadians = degToRad(60);

    var then = 0;
    calc_matrices();
    requestAnimationFrame(drawScene);

    // Draw the scene.
    function drawScene(now) {
        // get seconds
        now *= 0.01;
        var d_t = now - then;
        then = now;

        // Central point moves on sin
        var central_vert = Math.floor((num_vert ** 2 - 1) / 2);
        var centr_x = v_ar[central_vert].pos[0];
        var centr_z = v_ar[central_vert].pos[2];
        v_ar[central_vert].move([centr_x, amplitude * Math.sin(now / period), centr_z]);
        ClothUpdate(v_ar, s_ar, d_t);

        webglUtils.resizeCanvasToDisplaySize(gl.canvas);

        // Tell WebGL how to convert from clip space to pixels
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        // Clear the canvas AND the depth buffer.
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Turn on culling. By default backfacing triangles
        // will be culled.
        gl.enable(gl.CULL_FACE);

        // Enable the depth buffer
        gl.enable(gl.DEPTH_TEST);

        // Tell it to use our program (pair of shaders)
        gl.useProgram(program);

        set_buffers();

        // Set the matrices
        gl.uniformMatrix4fv(worldViewProjectionLocation, false, worldViewProjectionMatrix);
        gl.uniformMatrix4fv(worldInverseTransposeLocation, false, worldInverseTransposeMatrix);

        // set the light direction.
        var mLight = glMatrix.vec3.fromValues(0.5, 0.7, 1);
        gl.uniform3fv(reverseLightDirectionLocation, glMatrix.vec3.normalize(mLight, mLight));

        // Draw the geometry.
        var primitiveType = gl.TRIANGLES;
        var offset = 0;
        var count = (num_vert - 1) ** 2 * 2 * 3;
        //var count = 18;
        gl.drawArrays(primitiveType, offset, count);

        console.log('+ scene');

        // Call drawScene again next frame
        requestAnimationFrame(drawScene);
    }

    function calc_matrices() {
        // Compute the projection matrix
        var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        var zNear = 1;
        var zFar = 1000;
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

    function set_buffers() {
        var geom = get_geometry(v_ar, s_ar, num_vert);

        // Turn on the position attribute
        gl.enableVertexAttribArray(positionLocation);
        // Bind the position buffer.
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        var pos = setGeometry(geom.vertices);
        // Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
        var size = 3;          // 3 components per iteration
        var type = gl.FLOAT;   // the data is 32bit floats
        var normalize = false; // don't normalize the data
        var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(
            positionLocation, size, type, normalize, stride, offset);

        // Turn on the color attribute
        gl.enableVertexAttribArray(colorLocation);
        // Bind color buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        setColors(geom.colors);
        // Tell the attribute how to get data out of colorBuffer (ARRAY_BUFFER)
        var size = 4;          // 3 components per iteration
        var type = gl.FLOAT;   // the data is 32bit floating point values
        var normalize = false; // normalize the data (convert from 0-255 to 0-1)
        var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(
            colorLocation, size, type, normalize, stride, offset);

        // Turn on the normal attribute
        gl.enableVertexAttribArray(normalLocation);
        // Bind the normal buffer.
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        setNormals(pos);
        // Tell the attribute how to get data out of normalBuffer (ARRAY_BUFFER)
        var size = 3;          // 3 components per iteration
        var type = gl.FLOAT;   // the data is 32bit floating point values
        var normalize = false; // normalize the data (convert from 0-255 to 0-1)
        var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(
            normalLocation, size, type, normalize, stride, offset);
    }
    // Fill the buffer with the values that define a letter 'F'.
    function setGeometry(pos) {
        var positions = new Float32Array(pos);

        var matrix = glMatrix.mat4.create();
        glMatrix.mat4.rotateX(matrix, matrix, Math.PI);
        glMatrix.mat4.translate(matrix, matrix, [-50, -75, -15]);

        for (var i = 0; i < positions.length; i += 3) {
            var vector = glMatrix.vec3.fromValues(
                positions[i + 0],
                positions[i + 1],
                positions[i + 2]);
            glMatrix.vec3.transformMat4(vector, vector, matrix);
            positions[i + 0] = vector[0];
            positions[i + 1] = vector[1];
            positions[i + 2] = vector[2];
        }

        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        return positions;
    }

    function setColors(col) {
        var colors = new Float32Array(col);
        gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    }

    function setNormals(pos) {
        var norm = [];
        for (var i = 0; i < pos.length; i += 9) {
            var a = glMatrix.vec3.fromValues(pos[i], pos[i + 1], pos[i + 2]);
            var b = glMatrix.vec3.fromValues(pos[i + 3], pos[i + 4], pos[i + 5]);
            var c = glMatrix.vec3.fromValues(pos[i + 6], pos[i + 7], pos[i + 8]);
            var u = glMatrix.vec3.create();
            var v = glMatrix.vec3.create();
            glMatrix.vec3.sub(u, b, a);
            glMatrix.vec3.sub(v, c, a);
            var r = glMatrix.vec3.create();
            glMatrix.vec3.cross(r, u, v);
            norm.push(...r);
            norm.push(...r);
            norm.push(...r);
        }
        var normals = new Float32Array(norm);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    }
}


main();
