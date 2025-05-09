class Physics {
    constructor(ammo, onCollision = null) {
        this.timeAcc = 0;
        this.ammo = ammo;
        this.tmpTrans = new this.ammo.btTransform();
        this.tmpVec = new this.ammo.btVector3(0, 0, 0);
        this.tmpQuat = new this.ammo.btQuaternion(0, 0, 0, 1);
        this.onCollision = onCollision;

        let collisionConfiguration = new this.ammo.btDefaultCollisionConfiguration();
        this.dispatcher = new this.ammo.btCollisionDispatcher(collisionConfiguration);
        let overlappingPairCache = new this.ammo.btDbvtBroadphase();
        let solver = new this.ammo.btSequentialImpulseConstraintSolver();

        this.physicsWorld = new this.ammo.btDiscreteDynamicsWorld(this.dispatcher, overlappingPairCache, solver, collisionConfiguration);
        this.physicsWorld.setGravity(new this.ammo.btVector3(0, -10, 0));
    }

    //position: btVector3
    //quaternion: btQuaternion
    //scale: btVector3
    //mass: number
    box(position, rotation, scale, mass, alwaysAwake = false, collisionLayerMask=1, collideWithMask=-1) {
        let transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(position);
        transform.setRotation(rotation);
        let motionState = new Ammo.btDefaultMotionState(transform);

        let colShape = new Ammo.btBoxShape(scale);
        //colShape.setMargin(0.05);

        let localInertia = new Ammo.btVector3(0, 0, 0);
        colShape.calculateLocalInertia(mass, localInertia);

        let rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, colShape, localInertia);
        let body = new Ammo.btRigidBody(rbInfo);
        if (alwaysAwake) {
            body.setActivationState(4);
        }
        this.physicsWorld.addRigidBody(body, collisionLayerMask, collideWithMask);
        return body;
    }
    ball(position, rotation, radius, mass, alwaysAwake = false, collisionLayerMask=1, collideWithMask=-1) {
        let transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(position);
        transform.setRotation(rotation);
        let motionState = new Ammo.btDefaultMotionState(transform);

        let colShape = new Ammo.btSphereShape(radius);
        //colShape.setMargin(0.05);

        let localInertia = new Ammo.btVector3(0, 0, 0);
        colShape.calculateLocalInertia(mass, localInertia);

        let rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, colShape, localInertia);
        let body = new Ammo.btRigidBody(rbInfo);

        body.setFriction(4);
        body.setRollingFriction(10);
        body.setCcdMotionThreshold(0.001);
        body.setCcdSweptSphereRadius(radius);

        if (alwaysAwake) {
            body.setActivationState(4);
        }
        this.physicsWorld.addRigidBody(body, collisionLayerMask, collideWithMask);
        return body;
    }
    step(deltaTime, onStep) {
        const fixedDeltaTime = 16; //ms

        this.timeAcc += deltaTime;
        while (this.timeAcc >= fixedDeltaTime) {
            this.physicsWorld.stepSimulation(fixedDeltaTime);
            if (onStep) {
                onStep(fixedDeltaTime);
            }
            this.timeAcc -= fixedDeltaTime;
            
            if (this.onCollision != null) {
                let numManifolds = this.dispatcher.getNumManifolds();
                for (let i = 0; i < numManifolds; i++) {
                    let contactManifold = this.dispatcher.getManifoldByIndexInternal(i);
                    this.onCollision(
                        this.ammo.castObject(contactManifold.getBody0(), this.ammo.btRigidBody),
                        this.ammo.castObject(contactManifold.getBody1(), this.ammo.btRigidBody)
                    );
                }
            }
        }
    }
    remove(body) {
        this.physicsWorld.removeRigidBody(body);
        this.ammo.destroy(body.getMotionState());
        this.ammo.destroy(body);
    }
    setSync(body, syncData) {
        if (syncData == null) {
            console.warn("Skipped null syncData");
            return;
        }
        
        this.tmpVec.setValue(syncData.position.x, syncData.position.y, syncData.position.z);
        this.tmpTrans.setOrigin(this.tmpVec);
        this.tmpQuat.setValue(syncData.rotation.x, syncData.rotation.y, syncData.rotation.z, syncData.rotation.w);
        this.tmpTrans.setRotation(this.tmpQuat);
        body.setWorldTransform(this.tmpTrans);

        this.tmpVec.setValue(syncData.velocity.x, syncData.velocity.y, syncData.velocity.z);
        body.setLinearVelocity(this.tmpVec);
        this.tmpVec.setValue(syncData.angularVelocity.x, syncData.angularVelocity.y, syncData.angularVelocity.z);
        body.setAngularVelocity(this.tmpVec);
    }
    getSync(body) {
        let ms = body.getMotionState();
        if (ms) {
            ms.getWorldTransform(this.tmpTrans);
            let p = this.tmpTrans.getOrigin();
            let q = this.tmpTrans.getRotation();
            let vel = body.getLinearVelocity();
            let angVel = body.getAngularVelocity();
            return {
                position: { x: p.x(), y: p.y(), z: p.z() },
                rotation: { x: q.x(), y: q.y(), z: q.z(), w: q.w() },
                velocity: { x: vel.x(), y: vel.y(), z: vel.z() },
                angularVelocity: { x: angVel.x(), y: angVel.y(), z: angVel.z() },
            };
        }
        return null;
    }
    lerpSync(body, syncData, by, byRotation) {
        let ms = body.getMotionState();
        if (ms) {
            ms.getWorldTransform(this.tmpTrans);
            
            let p = this.tmpTrans.getOrigin();
            let old = { x: p.x(), y: p.y(), z: p.z() };
            let largestDistance = Math.max(Math.abs(old.x - syncData.position.x), Math.abs(old.y - syncData.position.y), Math.abs(old.z - syncData.position.z));
            if (largestDistance > 5) {
                by = 1;
                byRotation = 1;
                console.warn("snapped");
            }
            Util.lerpSyncVec(old, syncData.position, by);
            this.tmpVec.setValue(old.x, old.y, old.z);
            this.tmpTrans.setOrigin(this.tmpVec);

            let q = this.tmpTrans.getRotation();
            let oldRotation = { x: q.x(), y: q.y(), z: q.z(), w: q.w() };
            Util.lerpSyncQuat(oldRotation, syncData.rotation, byRotation);
            this.tmpQuat.setValue(oldRotation.x, oldRotation.y, oldRotation.z, oldRotation.w);
            this.tmpTrans.setRotation(this.tmpQuat);
            
            body.setWorldTransform(this.tmpTrans);
        }

        // hack: may need to delete this if it plays up
        
        this.tmpVec.setValue(syncData.velocity.x, syncData.velocity.y, syncData.velocity.z);
        body.setLinearVelocity(this.tmpVec);
        this.tmpVec.setValue(syncData.angularVelocity.x, syncData.angularVelocity.y, syncData.angularVelocity.z);
        body.setAngularVelocity(this.tmpVec);
    }
}

if (typeof module == "object") {
    module.exports = Physics;
}
