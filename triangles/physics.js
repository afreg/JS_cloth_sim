
/**
 * Vertex of a cloth, movement calculates with Verley algorythm
 */
class ClothVertex {
    /*========= FIELDS =========*/

    pos;                             // coordinates
    #d_pos;                         // previous movement
    force;                          // applied force module
    force_m = 0.0;                        // applied force scalar
    static st_force = [0.0, 0.0, 0.0]; // static force (i.e. gravity)
    static mass = 1.0;              // mass of every vertex
    static dissip = 0.002;
    #is_pinned = false;                     // pined point does not move with forces

    /*========= METHODS =========*/
    /** New ClothVertex object */
    constructor(n_pos) {
        this.pos = glMatrix.vec3.create();
        glMatrix.vec3.copy(this.pos, n_pos);
        this.#d_pos = glMatrix.vec3.create();
        this.force = glMatrix.vec3.create();
    }
    /**
     * Moves vertex to a new position
     * @param {number[]} n_pos new position of a vertex
     */
    move(n_pos) {
        if (!this.#is_pinned) {
            glMatrix.vec3.sub(this.#d_pos, n_pos, this.pos);
        }
        glMatrix.vec3.copy(this.pos, n_pos);
    }
    /**
     * Pins or unpins vertex
     * @param {boolean} pinned pin if true 
     */
    pin(pinned) {
        this.#is_pinned = pinned;
        glMatrix.vec3.zero(this.#d_pos);
    }
    /**
     * Updates vertex state based on calculations with Verley algorythm
     * @param {number} d_t time step 
     */
    update(d_t) {
        if (!this.#is_pinned) {
            var sum_force = glMatrix.vec3.create();
            glMatrix.vec3.add(sum_force, ClothVertex.st_force, this.force);
            var n_pos = glMatrix.vec3.create();
            // calc with Verley algorithm
            var scale = d_t * d_t / ClothVertex.mass;
            glMatrix.vec3.scale(n_pos, this.#d_pos, (1 - ClothVertex.dissip));
            glMatrix.vec3.scaleAndAdd(n_pos, n_pos, sum_force, scale);
            //glMatrix.vec3.scaleAndAdd(n_pos, this.#d_pos, sum_force, scale);
            // move
            glMatrix.vec3.add(this.pos, this.pos, n_pos);
            glMatrix.vec3.copy(this.#d_pos, n_pos);
            // save force module for coloring and empty force vector for further updates
            this.force_m = glMatrix.vec3.length(this.force);
            glMatrix.vec3.zero(this.force);
        };
    }
}

/**
 * Represents vertices connection as vectored spring
 */
class ClothSpring {
    /*========= FIELDS =========*/
    r_len;             // relaxed length
    d_len;              // deformed length
    tail;              // index of end vertex
    head;              // index of start vertex
    static hook = 10;   // Hook's coefficient

    /*========= METHODS =========*/
    /**
     * Constructs new spring
     * @param {number} dist vertices of a cloth
     * @param {number} i_t index of end vertex
     * @param {number} i_h index of start vertex
     */
    constructor(dist, i_t, i_h) {
        this.head = i_h;
        this.tail = i_t;
        this.r_len = dist;
        //glMatrix.vec3.distance(vert[i_h].pos, vert[i_t].pos);
        this.d_len = 0;
    }
    /**
     * Calculates deformation and corresponding forces
     * and applies result forces to connected vertices
     * @param {ClothVertex[]} vert vertices of a cloth
     */
    update(vert) {
        var dist_v = glMatrix.vec3.create();
        glMatrix.vec3.sub(dist_v, vert[this.tail].pos, vert[this.head].pos);
        // calculate deformed length
        this.d_len = glMatrix.vec3.length(dist_v);
        // calculate scaled force module
        var scalar_force =
            ClothSpring.hook * (1.0 - this.r_len / this.d_len);
        // scale force vectors, applied to tail and head of a spring
        var tail_force = glMatrix.vec3.create();
        var head_force = glMatrix.vec3.create();
        glMatrix.vec3.scale(head_force, dist_v, scalar_force);
        glMatrix.vec3.negate(tail_force, head_force);
        // add forces to vertices
        glMatrix.vec3.add(vert[this.tail].force, vert[this.tail].force, tail_force);
        glMatrix.vec3.add(vert[this.head].force, vert[this.head].force, head_force);
    }
}


/**
 * Initialize cloth vertexes and springs
 * @param {number} num_vert number of vertices per cloth side
 * @param {ClothVertex[]} vert_arr array of vertices
 * @param {ClothSpring[]} spr_arr array of springs
 * @param {number} side length of cloth side
 * @param {number} hook_c Hook's coefficient multiplicator
 */
function ClothInit(num_vert, vert_arr, spr_arr, side, hook_c) {
    ClothVertex.mass = 0.1 / num_vert / num_vert;
    ClothSpring.hook = hook_c / num_vert ** 2 * (num_vert - 1);
    // step between vetrices
    var step = side / (num_vert - 1);
    // total number of vertices
    var num_tot = num_vert ** 2;
    // vertex array iterator
    var iter = 0;
    for (let i = 0; i < num_vert; i++) {
        for (let j = 0; j < num_vert; j++) {
            // set vertex position
            var pos = [i * step, 0, j * step];
            // new vertex
            vert_arr[iter++] = new ClothVertex(pos);
        }
    }
    // set pinned vertices
    vert_arr[0].pin(true);
    vert_arr[num_vert - 1].pin(true);
    vert_arr[num_tot - 1].pin(true);
    vert_arr[num_tot - num_vert].pin(true);
    vert_arr[Math.floor((num_tot - 1) / 2)].pin(true);

    // spring array iterator
    iter = 0;
    for (let i = 0; i < num_vert; i++) {
        for (let j = 0; j < num_vert; j++) {
            var cur = j + i * num_vert;
            if (i < num_vert - 1) {
                // new spring (vertical)
                var next = cur + num_vert;
                var dist = glMatrix.vec3.distance(vert_arr[cur].pos, vert_arr[next].pos);
                spr_arr[iter++] = new ClothSpring(dist, cur, next);
            }
            if (j < num_vert - 1) {
                // new spring (horisontal)
                var next = cur + 1;
                var dist = glMatrix.vec3.distance(vert_arr[cur].pos, vert_arr[next].pos);
                spr_arr[iter++] = new ClothSpring(dist, cur, next);
            }
            if (i < num_vert - 1 && j < num_vert - 1) {
                // new spring (diagonal)
                var next = cur + num_vert + 1;
                var dist = glMatrix.vec3.distance(vert_arr[cur].pos, vert_arr[next].pos);
                spr_arr[iter++] = new ClothSpring(dist, cur, next);
            }
        }
    }
}


/**
 * Update cloth state
 * @param {ClothVertex[]} vert_arr array of vertices
 * @param {ClothSpring[]} spr_arr array of springs
 * @param {number} d_t time step
 * @param {number[]} ext_force array of dynamic external forces
 */
function ClothUpdate(vert_arr, spr_arr, d_t, ext_force) {
    // update all springs with relation to current virtices positions

    // forces from springs are added to vertices
    for (let i = 0; i < spr_arr.length; i++) {
        spr_arr[i].update(vert_arr);
    }
    // add all dynamic external forces
    if (ext_force) {
        ClothVertex.set_st_force(ext_force);
        //console.log('dynamic force added'); 
    }
    // update all vertices positions
    for (let i = 0; i < vert_arr.length; i++) {
        vert_arr[i].update(d_t);
    }
}

/**
 * Returns arrays of coordinates, colors and normales of triangles
 * @param {ClothVertex[]} v_ar array of vertices
 * @param {ClothSpring[]} s_ar array of springs
 * @param {number} n_v number of vertices per cloth side
 * @returns {Object} geometry data
 */
function get_geometry(v_ar, s_ar, n_v) {
    var vertices = [];
    for (let i = 0; i < n_v - 1; i++) {
        for (let j = 0; j < n_v - 1; j++) {
            var pos1 = v_ar[i * n_v + j].pos;
            var pos2 = v_ar[i * n_v + j + 1].pos;
            var pos3 = v_ar[(i + 1) * n_v + j].pos;
            var pos4 = v_ar[(i + 1) * n_v + j + 1].pos;
            vertices.push(...pos1);
            vertices.push(...pos2);
            vertices.push(...pos4);
            vertices.push(...pos1);
            vertices.push(...pos4);
            vertices.push(...pos3);
        }
    }

    var red_force = ClothSpring.hook * s_ar[0].r_len / 16;

    var colors = [];
    for (let i = 0; i < n_v - 1; i++) {
        for (let j = 0; j < n_v - 1; j++) {
            var f1 = v_ar[i * n_v + j].force_m * 2 / red_force;
            var f2 = v_ar[i * n_v + j + 1].force_m * 2 / red_force;
            var f3 = v_ar[(i + 1) * n_v + j].force_m * 2 / red_force;
            var f4 = v_ar[(i + 1) * n_v + j + 1].force_m * 2 / red_force;
            colors.push(f1 > 2.0 ? 1.0 : f1 / 2, f1 > 2.0 ? 0.0 : 1 - f1 / 2, 0, 1);
            colors.push(f2 > 2.0 ? 1.0 : f2 / 2, f2 > 2.0 ? 0.0 : 1 - f2 / 2, 0, 1);
            colors.push(f4 > 2.0 ? 1.0 : f4 / 2, f4 > 2.0 ? 0.0 : 1 - f4 / 2, 0, 1);
            colors.push(f1 > 2.0 ? 1.0 : f1 / 2, f1 > 2.0 ? 0.0 : 1 - f1 / 2, 0, 1);
            colors.push(f4 > 2.0 ? 1.0 : f4 / 2, f4 > 2.0 ? 0.0 : 1 - f4 / 2, 0, 1);
            colors.push(f3 > 2.0 ? 1.0 : f3 / 2, f3 > 2.0 ? 0.0 : 1 - f3 / 2, 0, 1);
        }
    }

    return {
        vertices: vertices,
        colors: colors
    };
}