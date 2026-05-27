import { Component, Property } from '@wonderlandengine/api';

export class MeshSpawner extends Component {
    static TypeName = 'mesh-spawner';
    static Properties = {
        defaultParent: Property.object(),
    };

    async spawnFromUrl(url, parentOverride) {
        if (!url) return null;
        const parent = parentOverride || this.defaultParent || this.object;

        try {
            const prefab = await this.engine.loadGLTF({ url, extensions: true });
            const { root } = this.engine.scene.instantiate(prefab);
            root.children.forEach((child) => {
                child.parent = parent;
            });
            root.destroy();
            return true;
        } catch (err) {
            console.warn('Failed to spawn model', err);
            return false;
        }
    }
}
