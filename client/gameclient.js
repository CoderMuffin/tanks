class GameClient {
    constructor(resources, ammo, mode = "online") {
        this.threeFont = resources.threeFont;
        this.tankGeometry = resources.tankGeometry;
        
        this.cubes = {};
        this.bullets = {};
        this.players = {};
        this.localID = null;

        this.physics = new Physics(ammo);
        this.initTHREE();
        
        let self = this;
        if (mode == "online") {
            setInterval(function() {
                for (var id in self.players) {
                    let player = self.players[id];
                    if (!player.sync.connected) { //set by server
                        self.physics.remove(player.body);
                        self.scene.remove(player.model);
                        delete self.players[id];
                    }
                    //if server doesn't reset it, either they or we have lost contact
                    player.sync.connected = false;                
                }
            }, 3000);
        }

        this.mode = mode;
        this.lastTime = Date.now();
        this.animate();
    }
    initTHREE(multiplayer) {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x00c8ff);

        let renderer = new THREE.WebGLRenderer();
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.domElement.id = "game-canvas";
        document.body.appendChild(renderer.domElement);
        
        this.cameras = [
            {
                camera: new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
                target: null,
                renderer: renderer
            }
        ];
        
        this.cameras[0].camera.position.set(3, 3, 3);
        this.cameras[0].camera.lookAt(0, 0, 0);

        let directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(-10, 10, 5);
        directionalLight.lookAt(0, 0, 0);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.bottom = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        this.scene.add(directionalLight);
        
        let ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        let self = this;
        window.addEventListener("resize", function() {
            for (var camera of self.cameras) {
                camera.camera.aspect = window.innerWidth / window.innerHeight;
                camera.camera.updateProjectionMatrix();
                camera.renderer.setSize(window.innerWidth, window.innerHeight);
            }
        });
    }

    addDemoTank() {
        let material = new THREE.MeshPhongMaterial({ color: 0xff0000, side: THREE.DoubleSide });
        this.demoTank = new THREE.Mesh(this.tankGeometry, material);
        this.scene.add(this.demoTank);
    }

    removeDemoTank() {
        this.scene.remove(this.demoTank);
    }

    spawnBullet(data) {
        let ball = Util.spawnBullet(this.physics, data.from, data.vel, data.mass);

        let geometry = new THREE.SphereGeometry(Util.bulletSize(data.mass));
        let material = new THREE.MeshPhongMaterial({ color: data.color });
        let mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(data.from.x, data.from.y, data.from.z);
        this.scene.add(mesh);
        this.bullets[data.id] = {
            body: ball,
            model: mesh
        }
        let self = this;
        setTimeout(function() {
            self.physics.remove(self.bullets[data.id].body);
            self.scene.remove(self.bullets[data.id].model);
            delete self.bullets[data.id];
        }, Util.BULLET_DESPAWN_DELAY); //small antidelay to prevent deletion after server
    }

    animate() {
        let now = Date.now();
        let deltaTime = now - this.lastTime;
        this.lastTime = now;

        this.physics.step(deltaTime);
        requestAnimationFrame(() => this.animate());

        if (this.demoTank) {
            this.demoTank.rotation.y += deltaTime / 3000;
        }
        
        for (var id in this.players) {
            this.players[id] = Util.stepPlayer(this.physics.ammo, this.players[id], deltaTime);
            if (this.cameras.length == 1) {
                this.players[id].text.lookAt(this.cameras[0].camera.position);
            }
            Util.updateModel(this.physics.ammo, this.players[id].body, this.players[id].model, id == this.localID);
        }

        for (var id in this.bullets) {
            Util.updateModel(this.physics.ammo, this.bullets[id].body, this.bullets[id].model);
        }

        for (var id in this.cubes) {
            Util.updateModel(this.physics.ammo, this.cubes[id].body, this.cubes[id].model);
        }

        for (var camera of this.cameras) {
            if (camera.target) {
                let offset = new THREE.Vector3();
                camera.target.getWorldDirection(offset);
                offset.setY(0).normalize().negate().multiplyScalar(2).setY(1);
                camera.camera.position.copy(camera.target.position);
                camera.camera.position.add(offset);
                camera.camera.lookAt(camera.target.position);
            }
            camera.renderer.render(this.scene, camera.camera);
        }
    }

    hit() {
        
    }

    createPlayer(id, name, color, type) {
        let meshGroup = new THREE.Group();
        
        let material = new THREE.MeshPhongMaterial({ color: color, side: THREE.DoubleSide });
        let cube = new THREE.Mesh(this.tankGeometry, material);
        cube.castShadow = true;
        meshGroup.add(cube);
        
        let fontGeometry = this.tankText(name + ": 0");
        let text = new THREE.Mesh(fontGeometry, material);
        text.position.set(0, 0.5, 0);
        text.scale.set(0.2, 0.2, 0.2);
        meshGroup.add(text);
        
        this.scene.add(meshGroup);

        this.players[id] = {
            model: meshGroup,
            text: text,
            body: Util.newPlayerBody(this.physics, type),
            sync: null
        }
    }

    tankText(name) {
        let geometry = new THREE.TextGeometry(name, {
            font: this.threeFont,
            size: 1,
            height: 0.5,
            curveSegments: 4,
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.05,
            bevelSegments: 3
        });
        geometry.center();
        return geometry;
    }

    sync(syncData) {
        for (var remotePlayer of syncData.players) {
            if (this.players[remotePlayer.id] == null) {
                this.createPlayer(remotePlayer.id, remotePlayer.sync.name, remotePlayer.sync.color, remotePlayer.sync.type);

                if (remotePlayer.id == this.localID) {
                    this.cameras[0].target = this.players[remotePlayer.id].model;
                }
            }
            this.players[remotePlayer.id].sync = remotePlayer.sync;
            this.physics.setSync(this.players[remotePlayer.id].body, remotePlayer.physicsSync);
        }
        for (var remoteBullet of syncData.bullets) {
            if (this.bullets[remoteBullet.id]) {
                this.physics.setSync(this.bullets[remoteBullet.id].body, remoteBullet.sync);
            } else {
                console.warn(`No such bullet for id "${remoteBullet.id}"`)
            }
        }
        for (var remoteMoveableCube of syncData.moveableCubes) {
            if (this.cubes[remoteMoveableCube.id]) {
                this.physics.setSync(this.cubes[remoteMoveableCube.id].body, remoteMoveableCube.sync);
            } else {
                console.warn(`No such cube for id "${remoteMoveableCube.id}"`)
            }
        }
        for (var scoreData of syncData.scoreData) {
            console.log(scoreData);
            this.updateScore(scoreData[0], scoreData[1]);
            if (this.players[scoreData[2]]) {
                this.updateScore(scoreData[2], scoreData[3]);
            }
        }
    }

    updateScore(playerID, score) {
        let player = this.players[playerID];
        player.score = score;
        //1 is text, 0 is model
        let text = player.model.children[1];
        text.geometry.dispose();
        text.geometry = this.tankText(player.sync.name + ": " + score);
    }

    hardSync(syncData) {
        this.localID = syncData.id;
        for (var cube of syncData.cubes) {
            this.cubes[cube.id] = cube;
        }
        Util.addCubeBodies(this.physics, Object.values(this.cubes), this.scene);
    }
}
