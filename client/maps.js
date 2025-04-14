var Maps = (function() {
        
    function simpleCube(x, z, size, mass) {
        return {
            position: { x: x, y: size / 2 - 0.5, z: z },
            rotation: { x: 0, y: 0, z: 0 },
            size: { x: size, y: size, z: size },
            friction: 0.8,
            mass: mass,
            texture: mass == 0 ? 0 : 1
        };
    }
    function deepCube(x, z, size) {
        return {
            position: { x: x, y: -0.5, z: z },
            rotation: { x: 0, y: 0, z: 0 },
            size: { x: size, y: size * 2, z: size },
            friction: 0.8,
            mass: 0,
            texture: 0
        };
    }
    function ring(fn, args, radius, step, excepts) {
        let result = [];
        for (var i = step - radius; i < radius; i += step) {
            if (!excepts.some(l => l.x == radius && l.z == i)) {
                result.push(fn(radius, i, ...args));
            }
            if (!excepts.some(l => l.x == -radius && l.z == i)) {
                result.push(fn(-radius, i, ...args));
            }
        }
        for (var i = step - radius; i < radius; i += step) {
            if (!excepts.some(l => l.z == radius && l.x == i)) {
                result.push(fn(i, radius, ...args));
            }
            if (!excepts.some(l => l.z == -radius && l.x == i)) {
                result.push(fn(i, -radius, ...args));
            }
        }

        if (!excepts.some(l => l.x == radius && l.z == radius)) {
            result.push(fn(radius, radius, ...args));
        }
        if (!excepts.some(l => l.x == radius && l.z == -radius)) {
            result.push(fn(radius, -radius, ...args));
        }
        if (!excepts.some(l => l.x == -radius && l.z == radius)) {
            result.push(fn(-radius, radius, ...args));
        }
        if (!excepts.some(l => l.x == -radius && l.z == -radius)) {
            result.push(fn(-radius, -radius, ...args));
        }

        return result;
    };

    return [
        [
            {
                position: { x: 0, y: -1, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                size: { x: 40, y: 1, z: 40 },
                friction: 0.5,
                mass: 0,
                texture: 0
            },
            deepCube(4, 4, 2, 0),
            deepCube(-4, 4, 2, 0),
            deepCube(4, -4, 2, 0),
            deepCube(-4, -4, 2, 0),

            simpleCube(0, 4, 2, 20),
            simpleCube(0, -4, 2, 20),
            simpleCube(4, 0, 2, 20),
            simpleCube(-4, 0, 2, 20),

            ...ring(simpleCube, [2, 20], 8, 2, [{ x: 0, z: 8 }, { x: 8, z: 0 }, { x: 0, z: -8 }, { x: -8, z: 0 }]),
            ...ring(simpleCube, [4, 30], 14, 4, [])
        ],
            [
            {
                position: { x: 0, y: -1, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                size: { x: 40, y: 1, z: 40 },
                friction: 0.5,
                mass: 0,
                texture: 0
            }
        ],
        [
            {
                position: { x: 0, y: -1, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                size: { x: 20, y: 1, z: 20 },
                friction: 0.5,
                mass: 0,
                texture: 0
            },
            ...ring(simpleCube, [0.8, 20], 9, 1, [])
        ]
    ];
})();

if (typeof module == "object") {
    module.exports = Maps;
}
