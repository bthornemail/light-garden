import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

class SceneComposer {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111122);
        
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        this.camera.position.set(10, 6, 10);
        this.camera.lookAt(0, 2, 0);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(800, 600);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = true;
        
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
        });
        this.scene.add(this.transformControls);
        
        this.sceneObjects = new Map();
        this.nextId = 1;
        
        this.setupLighting();
        this.setupGrid();
        this.loadAssetRegistry();
        this.setupEventListeners();
        this.updateSceneList();
        this.animate();
    }
    
    setupLighting() {
        const ambient = new THREE.AmbientLight(0x404060);
        this.scene.add(ambient);
        
        const sun = new THREE.DirectionalLight(0xffeedd, 1.5);
        sun.position.set(10, 20, 5);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        this.scene.add(sun);
        
        const fill = new THREE.DirectionalLight(0x446688, 0.8);
        fill.position.set(-5, 5, 10);
        this.scene.add(fill);
        
        const purple = new THREE.PointLight(0x8f00ff, 0.5, 20);
        purple.position.set(2, 3, 2);
        this.scene.add(purple);
        
        const green = new THREE.PointLight(0x00ff88, 0.3, 20);
        green.position.set(-2, 2, -2);
        this.scene.add(green);
    }
    
    setupGrid() {
        const groundGeo = new THREE.CircleGeometry(20, 32);
        const groundMat = new THREE.MeshStandardMaterial({ 
            color: 0x223344,
            roughness: 0.7,
            emissive: new THREE.Color(0x112233)
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        const grid = new THREE.GridHelper(40, 40, 0x8f00ff, 0x335588);
        grid.position.y = 0.01;
        this.scene.add(grid);
    }
    
    async loadAssetRegistry() {
        try {
            const response = await fetch('/api/assets');
            const text = await response.text();
            this.assetRegistry = text.split('\n')
                .filter(l => l.trim())
                .map(l => JSON.parse(l));
            this.renderAssetLibrary();
        } catch (e) {
            console.error('Failed to load assets:', e);
        }
    }
    
    renderAssetLibrary() {
        const grid = document.getElementById('asset-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        this.assetRegistry.forEach(asset => {
            const card = document.createElement('div');
            card.className = 'asset-card';
            card.draggable = true;
            card.dataset.asset = JSON.stringify(asset);
            
            card.innerHTML = `
                <div class="name">${asset.item}</div>
                <div class="group">${asset.group}</div>
                <div class="fano">Point ${asset.fanoPoint || '?'}</div>
            `;
            
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify(asset));
                card.classList.add('dragging');
            });
            
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
            });
            
            grid.appendChild(card);
        });
    }
    
    setupEventListeners() {
        const container = document.getElementById('canvas-container');
        container.addEventListener('dragover', (e) => e.preventDefault());
        container.addEventListener('drop', (e) => {
            e.preventDefault();
            const data = e.dataTransfer.getData('application/json');
            if (!data) return;
            
            const asset = JSON.parse(data);
            const rect = this.renderer.domElement.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
            
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const point = new THREE.Vector3();
            raycaster.ray.intersectPlane(plane, point);
            
            this.addAsset(asset, point);
        });
        
        document.getElementById('btn-translate').addEventListener('click', () => {
            this.transformControls.setMode('translate');
            this.setActiveTool('btn-translate');
        });
        
        document.getElementById('btn-rotate').addEventListener('click', () => {
            this.transformControls.setMode('rotate');
            this.setActiveTool('btn-rotate');
        });
        
        document.getElementById('btn-scale').addEventListener('click', () => {
            this.transformControls.setMode('scale');
            this.setActiveTool('btn-scale');
        });
        
        document.getElementById('btn-save').addEventListener('click', () => this.saveScene());
        document.getElementById('btn-load').addEventListener('click', () => this.loadScene());
        document.getElementById('btn-clear').addEventListener('click', () => this.clearScene());
        
        document.querySelectorAll('.article-btn').forEach(btn => {
            btn.addEventListener('click', () => this.loadArticleScene(btn.dataset.article));
        });
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.filterAssets(btn.dataset.filter);
            });
        });
    }
    
    setActiveTool(id) {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }
    
    filterAssets(filter) {
        document.querySelectorAll('.asset-card').forEach(card => {
            const asset = JSON.parse(card.dataset.asset);
            card.style.display = (filter === 'all' || asset.group === filter) ? 'block' : 'none';
        });
    }
    
    addAsset(asset, position) {
        const id = `asset-${this.nextId++}`;
        
        const colors = {
            'People': 0xff8800,
            'Places': 0x00ff88,
            'Things': 0x8f00ff
        };
        
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshStandardMaterial({ 
            color: colors[asset.group] || 0x8f00ff,
            roughness: 0.5,
            metalness: 0.3
        });
        
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(position);
        mesh.position.y = 0.5;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { id, asset };
        
        this.scene.add(mesh);
        this.sceneObjects.set(id, mesh);
        
        this.selectObject(mesh);
        this.updateAssetCount();
    }
    
    selectObject(object) {
        if (this.selectedObject) {
            this.transformControls.detach();
        }
        
        this.selectedObject = object;
        this.transformControls.attach(object);
        
        const info = document.getElementById('selected-info');
        if (object.userData.asset) {
            info.textContent = `Selected: ${object.userData.asset.item}`;
        }
        
        this.updatePropertyPanel(object);
    }
    
    updatePropertyPanel(object) {
        const panel = document.getElementById('property-panel');
        
        if (!object || !object.userData.asset) {
            panel.innerHTML = '<p class="hint">Select an asset to edit</p>';
            return;
        }
        
        const asset = object.userData.asset;
        
        panel.innerHTML = `
            <div class="property-group">
                <label>Position</label>
                <div class="vector3">
                    <input type="number" class="pos-x" step="0.1" value="${object.position.x.toFixed(2)}">
                    <input type="number" class="pos-y" step="0.1" value="${object.position.y.toFixed(2)}">
                    <input type="number" class="pos-z" step="0.1" value="${object.position.z.toFixed(2)}">
                </div>
                <label>Rotation (degrees)</label>
                <div class="vector3">
                    <input type="number" class="rot-x" step="1" value="${(object.rotation.x * 180 / Math.PI).toFixed(0)}">
                    <input type="number" class="rot-y" step="1" value="${(object.rotation.y * 180 / Math.PI).toFixed(0)}">
                    <input type="number" class="rot-z" step="1" value="${(object.rotation.z * 180 / Math.PI).toFixed(0)}">
                </div>
                <label>Scale</label>
                <div class="vector3">
                    <input type="number" class="scl-x" step="0.1" min="0.1" value="${object.scale.x.toFixed(2)}">
                    <input type="number" class="scl-y" step="0.1" min="0.1" value="${object.scale.y.toFixed(2)}">
                    <input type="number" class="scl-z" step="0.1" min="0.1" value="${object.scale.z.toFixed(2)}">
                </div>
                <button class="btn-delete">Delete</button>
            </div>
        `;
        
        panel.querySelector('.pos-x').addEventListener('input', e => object.position.x = parseFloat(e.target.value));
        panel.querySelector('.pos-y').addEventListener('input', e => object.position.y = parseFloat(e.target.value));
        panel.querySelector('.pos-z').addEventListener('input', e => object.position.z = parseFloat(e.target.value));
        panel.querySelector('.rot-x').addEventListener('input', e => object.rotation.x = parseFloat(e.target.value) * Math.PI / 180);
        panel.querySelector('.rot-y').addEventListener('input', e => object.rotation.y = parseFloat(e.target.value) * Math.PI / 180);
        panel.querySelector('.rot-z').addEventListener('input', e => object.rotation.z = parseFloat(e.target.value) * Math.PI / 180);
        panel.querySelector('.scl-x').addEventListener('input', e => object.scale.x = parseFloat(e.target.value));
        panel.querySelector('.scl-y').addEventListener('input', e => object.scale.y = parseFloat(e.target.value));
        panel.querySelector('.scl-z').addEventListener('input', e => object.scale.z = parseFloat(e.target.value));
        
        panel.querySelector('.btn-delete').addEventListener('click', () => {
            this.scene.remove(object);
            this.sceneObjects.delete(object.userData.id);
            this.selectedObject = null;
            this.transformControls.detach();
            this.updatePropertyPanel(null);
            this.updateAssetCount();
        });
    }
    
    saveScene() {
        const name = prompt('Enter scene name:', `Scene ${new Date().toLocaleString()}`);
        if (!name) return;
        
        const sceneData = {
            name,
            date: new Date().toISOString(),
            assets: []
        };
        
        this.sceneObjects.forEach((obj, id) => {
            if (!obj.userData.asset) return;
            sceneData.assets.push({
                id,
                asset: obj.userData.asset,
                position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
                scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
            });
        });
        
        const scenes = JSON.parse(localStorage.getItem('fano-scenes') || '{}');
        scenes[name] = sceneData;
        localStorage.setItem('fano-scenes', JSON.stringify(scenes));
        
        this.updateSceneList();
        document.getElementById('scene-name').textContent = name;
    }
    
    loadScene() {
        const name = prompt('Enter scene name to load:');
        if (!name) return;
        
        const scenes = JSON.parse(localStorage.getItem('fano-scenes') || '{}');
        const data = scenes[name];
        
        if (!data) {
            alert('Scene not found');
            return;
        }
        
        this.clearScene();
        
        data.assets.forEach(assetData => {
            const pos = new THREE.Vector3(
                assetData.position.x,
                assetData.position.y,
                assetData.position.z
            );
            this.addAsset(assetData.asset, pos);
            
            const obj = Array.from(this.sceneObjects.values()).pop();
            if (obj) {
                obj.rotation.set(assetData.rotation.x, assetData.rotation.y, assetData.rotation.z);
                obj.scale.set(assetData.scale.x, assetData.scale.y, assetData.scale.z);
            }
        });
        
        document.getElementById('scene-name').textContent = name;
    }
    
    clearScene() {
        this.sceneObjects.forEach(obj => this.scene.remove(obj));
        this.sceneObjects.clear();
        this.selectedObject = null;
        this.transformControls.detach();
        this.updatePropertyPanel(null);
        this.updateAssetCount();
        document.getElementById('scene-name').textContent = 'Untitled Scene';
    }
    
    updateAssetCount() {
        document.getElementById('asset-count').textContent = `${this.sceneObjects.size} assets`;
    }
    
    updateSceneList() {
        const list = document.getElementById('scene-list');
        const scenes = JSON.parse(localStorage.getItem('fano-scenes') || '{}');
        
        list.innerHTML = '';
        Object.entries(scenes).forEach(([name, data]) => {
            const item = document.createElement('div');
            item.className = 'scene-item';
            item.innerHTML = `
                <span class="name">${name}</span>
                <span class="date">${new Date(data.date).toLocaleDateString()}</span>
            `;
            item.addEventListener('click', () => {
                this.clearScene();
                data.assets.forEach(assetData => {
                    const pos = new THREE.Vector3(assetData.position.x, assetData.position.y, assetData.position.z);
                    this.addAsset(assetData.asset, pos);
                });
                document.getElementById('scene-name').textContent = name;
            });
            list.appendChild(item);
        });
    }
    
    async loadArticleScene(article) {
        this.clearScene();
        
        const positions = [
            new THREE.Vector3(-3, 0, -2),
            new THREE.Vector3(0, 0, -2),
            new THREE.Vector3(3, 0, -2),
            new THREE.Vector3(-2, 0, 2),
            new THREE.Vector3(2, 0, 2)
        ];
        
        const articleAssets = this.assetRegistry.filter(a => a.article === article);
        
        for (let i = 0; i < Math.min(articleAssets.length, positions.length); i++) {
            this.addAsset(articleAssets[i], positions[i]);
        }
        
        document.getElementById('scene-name').textContent = `Article ${article}`;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
    
    mount(element) {
        element.appendChild(this.renderer.domElement);
        this.renderer.setSize(element.clientWidth, element.clientHeight);
        
        window.addEventListener('resize', () => {
            this.renderer.setSize(element.clientWidth, element.clientHeight);
            this.camera.aspect = element.clientWidth / element.clientHeight;
            this.camera.updateProjectionMatrix();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('canvas-container');
    const composer = new SceneComposer();
    composer.mount(container);
    window.composer = composer;
});
