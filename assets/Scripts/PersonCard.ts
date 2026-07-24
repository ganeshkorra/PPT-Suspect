import { _decorator, Color, Component, Node, Sprite } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('PersonCard')
export class PersonCard extends Component {
    @property([String]) public personIds: string[] = [];
    @property public isSuspect = false;
    @property([Sprite]) public tintTargets: Sprite[] = [];
    @property(Node) public sourceButton: Node | null = null;

    private originalColors: Color[] = [];
    private lockedInSlot = false;

    onLoad() {
        if (!this.sourceButton && this.node.parent?.name.startsWith('Button')) {
            this.sourceButton = this.node.parent;
        }
        if (this.tintTargets.length === 0) {
            const sprite = this.getComponent(Sprite);
            if (sprite) this.tintTargets = [sprite];
        }
        this.originalColors = this.tintTargets.map((sprite) => sprite.color.clone());
    }

    public matches(requiredIds: string[]) {
        return requiredIds.length > 0 && requiredIds.every((requiredId) => this.personIds.indexOf(requiredId) !== -1);
    }

    public setIncorrect(isIncorrect: boolean) {
        this.tintTargets.forEach((sprite, index) => {
            sprite.color = isIncorrect ? new Color(220, 65, 65, 255) : this.originalColors[index].clone();
        });
    }

    public setLockedInSlot(isLocked: boolean) {
        this.lockedInSlot = isLocked;
    }

    public get isLockedInSlot() {
        return this.lockedInSlot;
    }

    public hideSourceButton() {
        if (this.sourceButton && this.sourceButton !== this.node) this.sourceButton.active = false;
    }

    public showSourceButton() {
        if (this.sourceButton && this.sourceButton !== this.node) this.sourceButton.active = true;
    }
}
