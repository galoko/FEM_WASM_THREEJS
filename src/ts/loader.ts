import * as THREE from 'three';

class ParsedTetFile {
    // all vertices
    vertices: Array<number> = [];
    // all texCoords
    texCoords: Array<number> = [];

    // [[v, t], [v, t], [v, t]]
    faces: Array<Array<Array<number>>> = [];
    // indices [v, v, v, v] per tet
    tetsIndices: Array<number> = [];
}

export class TetFile {
    // these two will go to simulation
    vertices: Float32Array;
    tetsIndices: Uint32Array;
    normals: Float32Array;

    // this will be just copied to GL buffer
    texCoords: Float32Array;

    // this will need to be calculated after vertices update
    faceNormals: Float32Array;
    // temporary buffer for normal calculation
    faceAreas: Float32Array;

    // this will be used to reconstruct GL buffer
    faces: Array<Array<Array<number>>>;
    // list of faces connected to vertex
    connectedFaces: Map<number, Array<number>>;

    verticesPositions: Float32Array;
    verticesTexCoords: Float32Array;
    verticesNormals: Float32Array;

    geometry: THREE.BufferGeometry;

    triangleCount: number;

    public recalcNormals(): void {
        for (let faceIndex = 0; faceIndex < this.faces.length; faceIndex++) {
            const face = this.faces[faceIndex];

            const x0 = this.vertices[face[0][0] * 3 + 0];
            const y0 = this.vertices[face[0][0] * 3 + 1];
            const z0 = this.vertices[face[0][0] * 3 + 2];

            const x1 = this.vertices[face[1][0] * 3 + 0];
            const y1 = this.vertices[face[1][0] * 3 + 1];
            const z1 = this.vertices[face[1][0] * 3 + 2];

            const x2 = this.vertices[face[2][0] * 3 + 0];
            const y2 = this.vertices[face[2][0] * 3 + 1];
            const z2 = this.vertices[face[2][0] * 3 + 2];

            const xA = x0 - x1;
            const yA = y0 - y1;
            const zA = z0 - z1;

            const xB = x0 - x2;
            const yB = y0 - y2;
            const zB = z0 - z2;

            const xC = x1 - x2;
            const yC = y1 - y2;
            const zC = z1 - z2;

            const a = Math.hypot(xA, yA, zA);
            const b = Math.hypot(xB, yB, zB);
            const c = Math.hypot(xC, yC, zC);

            const s = (a + b + c) * 0.5;

            const area = Math.sqrt(s * (s - a) * (s - b) * (s - c));

            const xN = yA * zB - zA * yB;
            const yN = zA * xB - xA * zB;
            const zN = xA * yB - yA * xB;
            const n = Math.hypot(xN, yN, zN);

            this.faceNormals[faceIndex * 3 + 0] = xN / n;
            this.faceNormals[faceIndex * 3 + 1] = yN / n;
            this.faceNormals[faceIndex * 3 + 2] = zN / n;

            this.faceAreas[faceIndex] = area;
        }

        for (const entry of this.connectedFaces.entries()) {
            const vertexIndex = entry[0];
            const connections = entry[1];

            let vnx = 0;
            let vny = 0;
            let vnz = 0;
            let areaSum = 0;

            for (const faceIndex of connections) {
                const fnx = this.faceNormals[faceIndex * 3 + 0];
                const fny = this.faceNormals[faceIndex * 3 + 1];
                const fnz = this.faceNormals[faceIndex * 3 + 2];
                const faceArea = this.faceAreas[faceIndex];

                vnx += fnx;
                vny += fny;
                vnz += fnz;

                areaSum += faceArea;
            }

            vnx /= areaSum;
            vny /= areaSum;
            vnz /= areaSum;

            const len = Math.hypot(vnx, vny, vnz);

            vnx /= len;
            vny /= len;
            vnz /= len;

            this.normals[vertexIndex * 3 + 0] = vnx;
            this.normals[vertexIndex * 3 + 1] = vny;
            this.normals[vertexIndex * 3 + 2] = vnz;
        }

        let vertexVisualIndex = 0;
        for (let faceIndex = 0; faceIndex < this.faces.length; faceIndex++) {
            const face = this.faces[faceIndex];

            for (let faceEntryIndex = 0; faceEntryIndex < face.length; faceEntryIndex++) {
                const faceEntry = face[faceEntryIndex];

                const vertexIndex = faceEntry[0];

                this.verticesNormals[vertexVisualIndex * 3 + 0] = this.normals[vertexIndex * 3 + 0];
                this.verticesNormals[vertexVisualIndex * 3 + 1] = this.normals[vertexIndex * 3 + 1];
                this.verticesNormals[vertexVisualIndex * 3 + 2] = this.normals[vertexIndex * 3 + 2];

                vertexVisualIndex++;
            }
        }

        if (this.geometry) {
            this.geometry.attributes.normal.needsUpdate = true;
        }
    }

    public copyDataToBuffer(): void {
        let vertexIndex = 0;
        for (let faceIndex = 0; faceIndex < this.faces.length; faceIndex++) {
            const face = this.faces[faceIndex];

            for (let faceEntryIndex = 0; faceEntryIndex < face.length; faceEntryIndex++) {
                const faceEntry = face[faceEntryIndex];

                this.verticesPositions[vertexIndex * 3 + 0] = this.vertices[faceEntry[0] * 3 + 0];
                this.verticesPositions[vertexIndex * 3 + 1] = this.vertices[faceEntry[0] * 3 + 1];
                this.verticesPositions[vertexIndex * 3 + 2] = this.vertices[faceEntry[0] * 3 + 2];
                vertexIndex++;
            }
        }
        if (this.geometry) {
            this.geometry.attributes.position.needsUpdate = true;
        }
    }
}
export class Loader {
    loader: THREE.TextureLoader;

    constructor() {
        this.loader = new THREE.TextureLoader();
    }

    async fetchText(url: string): Promise<string> {
        return new Promise<string>(async (resolve, reject) => {
            const response = await fetch(url);
            if (response.status !== 200) {
                reject('Failed to fetch file.');
                return;
            }

            resolve(await response.text());
        });
    }

    loadTet(url: string): Promise<TetFile> {
        return new Promise<TetFile>(async (resolve, reject) => {
            const tet: ParsedTetFile = this.parseTetFile(await this.fetchText(url));

            const result = new TetFile();

            result.triangleCount = tet.faces.length;

            // parsed data
            result.vertices = new Float32Array(tet.vertices);
            result.tetsIndices = new Uint32Array(tet.tetsIndices);
            result.faces = tet.faces;
            result.texCoords = new Float32Array(tet.texCoords);

            // temp data
            result.faceNormals = new Float32Array(result.triangleCount * 3);
            result.faceAreas = new Float32Array(result.triangleCount);
            result.normals = new Float32Array(result.vertices.length * 3);

            // filling out connected faces info
            result.connectedFaces = new Map();
            for (let faceIndex = 0; faceIndex < result.faces.length; faceIndex++) {
                for (let faceVertexIndex = 0; faceVertexIndex < 3; faceVertexIndex++) {
                    const vertexIndex = result.faces[faceIndex][faceVertexIndex][0];
                    const connections = result.connectedFaces.get(vertexIndex) || [];
                    if (!connections.includes(faceIndex)) {
                        connections.push(faceIndex);
                    }
                    result.connectedFaces.set(vertexIndex, connections);
                }
            }

            // three js data
            result.verticesPositions = new Float32Array(result.triangleCount * 3 * 3);
            result.verticesTexCoords = new Float32Array(result.triangleCount * 3 * 2);
            result.verticesNormals = new Float32Array(result.triangleCount * 3 * 3);

            // заполняем массив с текстурными координатами заранее
            let vertexIndex = 0;
            for (let faceIndex = 0; faceIndex < result.faces.length; faceIndex++) {
                const face = result.faces[faceIndex];

                for (let faceEntryIndex = 0; faceEntryIndex < face.length; faceEntryIndex++) {
                    const faceEntry = face[faceEntryIndex];

                    result.verticesTexCoords[vertexIndex * 2 + 0] = result.texCoords[faceEntry[1] * 2 + 0];
                    result.verticesTexCoords[vertexIndex * 2 + 1] = result.texCoords[faceEntry[1] * 2 + 1];

                    vertexIndex++;
                }
            }

            result.recalcNormals();
            result.copyDataToBuffer();

            // создаем геометрию для ThreeJS
            result.geometry = new THREE.BufferGeometry();
            result.geometry.setAttribute('position', new THREE.BufferAttribute(result.verticesPositions, 3));
            result.geometry.setAttribute('uv', new THREE.BufferAttribute(result.verticesTexCoords, 2));
            result.geometry.setAttribute('normal', new THREE.BufferAttribute(result.verticesNormals, 3));

            resolve(result);
        });
    }

    async loadTexture(url: string): Promise<THREE.Texture> {
        return new Promise((resolve, reject) => {
            this.loader.load(
                url,
                texture => {
                    resolve(texture);
                },
                () => {
                    //
                },
                () => {
                    reject();
                },
            );
        });
    }

    parseTetFile(text: string): ParsedTetFile {
        const result = new ParsedTetFile();
        const lines: Array<string> = text.split(/\r?\n/);
        lines.forEach((line: string): void => {
            line = line.trim();
            if (line.startsWith('#')) return;
            const values: Array<string> = line.split(' ');
            if (values.length < 1) return;
            switch (values[0]) {
                case 'v': {
                    result.vertices.push(parseFloat(values[1]));
                    result.vertices.push(parseFloat(values[2]));
                    result.vertices.push(parseFloat(values[3]));
                    break;
                }
                case 'vt': {
                    result.texCoords.push(parseFloat(values[1]));
                    result.texCoords.push(parseFloat(values[2]));
                    break;
                }
                case 'f': {
                    const face: Array<Array<number>> = [];
                    for (let i = 0; i < 3; i++) {
                        const indicesStrs: Array<string> = values[1 + i].split('/');
                        const indices: Array<number> = [];
                        for (let j = 0; j < indicesStrs.length; j++) {
                            indices.push(parseInt(indicesStrs[j]) - 1);
                        }
                        face.push(indices);
                    }
                    result.faces.push(face);
                    break;
                }
                case 't': {
                    result.tetsIndices.push(parseInt(values[1]) - 1);
                    result.tetsIndices.push(parseInt(values[2]) - 1);
                    result.tetsIndices.push(parseInt(values[3]) - 1);
                    result.tetsIndices.push(parseInt(values[4]) - 1);
                    break;
                }
            }
        });
        return result;
    }
}
