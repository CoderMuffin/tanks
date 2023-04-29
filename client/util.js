Array.prototype.removeIf = function(callback) {
    var i = this.length;
    while (i--) {
        if (callback(this[i], i)) {
            this.splice(i, 1);
        }
    }
};

const Util = {
    BULLET_DESPAWN_DELAY: 5000,
    tmpVec: null,
    tmpThreeVec: null,
    tmpQuat: null,
    tmpThreeQuat: null,
    tmpTrans: null,
    tankData: [
        {
            weight: 1,
            cooldown: 300,
            bulletMass: 0.5,
            speed: 1,
            turnSpeed: 0.6,
            bulletSpeed: 25,
            ammo: Infinity,
            ammoCooldown: 0
        },
        {
            weight: 1.5,
            cooldown: 200,
            bulletMass: 2.5,
            speed: 1,
            turnSpeed: 0.9,
            bulletSpeed: 20,
            ammo: Infinity,
            ammoCooldown: 0
        },
        {
            weight: 2.5,
            cooldown: 700,
            bulletMass: 6,
            speed: 2,
            turnSpeed: 1.6,
            bulletSpeed: 20,
            ammo: Infinity,
            ammoCooldown: 0
        },
        {
            weight: 1.5,
            cooldown: 200,
            bulletMass: 4,
            speed: 1,
            turnSpeed: 0.9,
            bulletSpeed: 20,
            ammo: 3,
            ammoCooldown: 800,
        }
    ],
    generateID() {
        return (new Array(16)).fill().map(_ => Math.floor(Math.random() * 16).toString(16)).join("");
    },
    getFacingFromQuaternion(q, out) {
        let x = q.x();
        let y = q.y();
        let z = q.z();
        let w = q.w();
        out.setValue(2 * (x*z + w*y), 2 * (y*z - w*x), 1 - 2 * (x*x + y*y));
    },
    newPlayerBody(physics, type) {
        let box = physics.box(
            new physics.ammo.btVector3(0, 0, 0),
            new physics.ammo.btQuaternion(0, 0, 0, 1),
            new physics.ammo.btVector3(0.3, 0.25, 0.5),
            Util.tankData[type].weight,
            true
        );
        Util.setPlayerControl(box, true);
        return box;
    },
    prepareTmps(ammo) {
        if (Util.tmpVec == null) Util.tmpVec = new ammo.btVector3(0, 0, 0);
        if (Util.tmpQuat == null) Util.tmpQuat = new ammo.btQuaternion(0, 0, 0, 1);
        if (Util.tmpTrans == null) Util.tmpTrans = new ammo.btTransform();
    },
    setPlayerControl(body, inControl) {
        body.setDamping(inControl ? 0.8 : 0.3, inControl ? 0.999 : 0.3);
    },
    stepPlayer(ammo, player, deltaTime) {
        Util.prepareTmps(ammo);
        let ms = player.body.getMotionState();
        if (ms) {
            ms.getWorldTransform(Util.tmpTrans);
            let q = Util.tmpTrans.getRotation();
            Util.getFacingFromQuaternion(q, Util.tmpVec);
            if (player.sync.wasd.y == 1) {
                //player.body.activate(true);
                player.body.applyCentralForce(Util.tmpVec.op_mul(deltaTime / 2 * Util.tankData[player.type].speed));
            } else if (player.sync.wasd.y == -1) {
                //player.body.activate(true);
                player.body.applyCentralForce(Util.tmpVec.op_mul(-deltaTime / 2 * Util.tankData[player.type].speed));
            } 
            
            if (player.sync.wasd.x != 0) {
                //player.body.activate(true);
                let turnSpeedScale = 1 - Math.abs(player.sync.wasd.y) * 0.3;
                Util.tmpVec.setValue(0, -(player.sync.wasd.x * turnSpeedScale) * deltaTime / 5 * Util.tankData[player.type].turnSpeed, 0);
                player.body.applyTorque(Util.tmpVec);
            }
        }
        return player;
    },
    addCubeBodies(physics, cubes, scene = null) {
        Util.prepareTmps(physics.ammo);
        for (var cube of cubes) {
            Util.tmpVec.setValue(cube.position.x, cube.position.y, cube.position.z);
            Util.tmpQuat.setEulerZYX(cube.rotation.x, cube.rotation.y, cube.rotation.x);
            cube.body = physics.box(
                Util.tmpVec,
                Util.tmpQuat,
                new physics.ammo.btVector3(cube.size.x / 2, cube.size.y / 2, cube.size.z / 2),
                cube.mass
            );
            cube.body.setFriction(cube.friction);
            if (scene) {
                let geometry = new THREE.RoundedBoxGeometry();
                let material = Util.cubeMaterials[cube.texture];
                let mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(cube.position.x, cube.position.y, cube.position.z);
                mesh.rotation.set(cube.rotation.x, cube.rotation.y, cube.rotation.z, "ZYX");
                mesh.scale.set(cube.size.x, cube.size.y, cube.size.z);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                
                cube.model = mesh;
                scene.add(mesh);
            }
        }
    },
    bulletSize(mass) {
        return Math.min(0.3, Math.max(0.1, 0.04 * mass));
    },
    spawnBullet(physics, from, vel, mass) {
        Util.prepareTmps(physics.ammo);
        Util.tmpVec.setValue(from.x, from.y, from.z);
        Util.tmpQuat.setValue(0, 0, 0, 1);
        let ball = physics.ball(
            Util.tmpVec,
            Util.tmpQuat,
            Util.bulletSize(mass),
            mass
        );
        ball.setLinearVelocity(new physics.ammo.btVector3(vel.x, vel.y, vel.z));
        return ball;
    },
    updateModel(ammo, body, model, lerp=false) {
        Util.prepareTmps(ammo);
        let ms = body.getMotionState();
        if (ms) {
            ms.getWorldTransform(Util.tmpTrans);
            let p = Util.tmpTrans.getOrigin();
            let q = Util.tmpTrans.getRotation();
            if (lerp) {
                Util.tmpThreeVec.set(p.x(), p.y(), p.z());
                Util.tmpThreeQuat.set(q.x(), q.y(), q.z(), q.w());
                model.position.lerp(Util.tmpThreeVec, 0.3);
                model.quaternion.slerp(Util.tmpThreeQuat, 0.3);
            } else {
                model.position.set(p.x(), p.y(), p.z());
                model.quaternion.set(q.x(), q.y(), q.z(), q.w());
            }
        }
    }
};

if (typeof THREE == "object") {
    Util.cubeMaterials = [
        new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 0 }),
        new THREE.MeshPhongMaterial({
            map: (new THREE.TextureLoader()).load('img/wood.jpg'),
            shininess: 50
        }),
    ];
    Util.tmpThreeVec = new THREE.Vector3(0, 0, 0);
    Util.tmpThreeQuat = new THREE.Quaternion(0, 0, 0, 1);
}

if (typeof module == "object") {
    module.exports = Util;
}
