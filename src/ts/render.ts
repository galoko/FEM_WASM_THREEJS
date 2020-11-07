import * as THREE from 'three';

import { Loader, TetFile } from './loader';

export default class Render {
    private scene: THREE.Scene;
    private renderer: THREE.WebGLRenderer;
    private camera: THREE.PerspectiveCamera;

    private wallsSize: number;

    private cubeModel: THREE.Mesh;
    private donutModel: THREE.Mesh;

    private donut: TetFile;

    private width: number;
    private height: number;

    constructor() {
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer();
        document.body.appendChild(this.renderer.domElement);

        this.resize();
    }

    async load(): Promise<void> {
        const loader: Loader = new Loader();

        this.cubeModel = new THREE.Mesh(
            new THREE.BoxGeometry(this.wallsSize, this.wallsSize, this.wallsSize),
            new THREE.MeshPhongMaterial({
                map: await loader.loadTexture('build/data/wall.png'),
                side: THREE.BackSide,
            }),
        );
        this.cubeModel.castShadow = false;
        this.cubeModel.receiveShadow = true;

        this.donut = await loader.loadTet('build/data/model.tet');
        this.donutModel = new THREE.Mesh(
            this.donut.geometry,
            new THREE.MeshPhongMaterial({
                map: await loader.loadTexture('build/data/model.png'),
                reflectivity: 0,
                shininess: 0,
            }),
        );
        this.donutModel.castShadow = true;
        this.donutModel.receiveShadow = false;

        const light = new THREE.PointLight(0xffffff, 1, 100);
        light.position.set(0, 0, this.wallsSize / 2);
        light.castShadow = true;

        light.shadow.mapSize.width = 1024; // default
        light.shadow.mapSize.height = 1024; // default
        light.shadow.camera.near = 0.01; // default
        light.shadow.camera.far = 500; // default
        light.shadow.bias = 0.001;

        this.scene.add(light);
        this.scene.add(this.cubeModel);
        this.scene.add(this.donutModel);

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    resize(): void {
        const dpr = window.devicePixelRatio;
        const style = getComputedStyle(document.body);
        const width = parseFloat(style.width) * dpr;
        const height = parseFloat(style.height) * dpr;

        if (this.width == width && this.height === height) {
            return;
        }

        this.width = width;
        this.height = height;

        this.renderer.setSize(width, height);

        const aspectRatio = width / height;
        if (!this.camera) {
            const FOV = 60;
            this.camera = new THREE.PerspectiveCamera(FOV, aspectRatio, 0.1, 1000.0);
            this.camera.up.set(0, 0, 1);
        } else {
            this.camera.aspect = aspectRatio;
            this.camera.updateProjectionMatrix();
        }
    }

    setCameraPosition(x: number, y: number, z: number): void {
        this.camera.position.set(x, y, z);
    }

    // генерирует углы камеры для взгляда на точку из текущей позиции камеры
    lookAtPoint(x: number, y: number, z: number): void {
        this.camera.lookAt(x, y, z);
    }

    draw(): void {
        this.renderer.render(this.scene, this.camera);
    }

    wrapDebug(context: WebGLRenderingContext): WebGLRenderingContext {
        function glEnumToString(gl: WebGLRenderingContext, value: number): string {
            // Optimization for the most common enum:
            if (value === gl.NO_ERROR) {
                return 'NO_ERROR';
            }
            for (const p in gl) {
                if ((gl as any)[p] === value) {
                    return p;
                }
            }
            return '0x' + value.toString(16);
        }

        function createGLErrorWrapper(context: WebGLRenderingContext, fname: string): () => any {
            return (...args): any => {
                const rv = (context as any)[fname].apply(context, args);
                const err = context.getError();
                if (err !== context.NO_ERROR) throw 'GL error ' + glEnumToString(context, err) + ' in ' + fname;
                return rv;
            };
        }

        const wrap: any = {};
        for (const i in context) {
            try {
                if (typeof (context as any)[i] === 'function') {
                    wrap[i] = createGLErrorWrapper(context, i);
                } else {
                    wrap[i] = (context as any)[i];
                }
            } catch (e) {}
        }
        wrap.getError = (): number => {
            return context.getError();
        };
        return wrap;
    }

    getTetModel(): TetFile {
        return this.donut;
    }

    updateTetModel(): void {
        const tetModel = this.getTetModel();
        tetModel.recalcNormals();
        tetModel.copyDataToBuffer();
    }

    setWallsSize(size: number): void {
        this.wallsSize = size;
    }
}
