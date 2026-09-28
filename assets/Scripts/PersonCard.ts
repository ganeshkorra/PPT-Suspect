import { _decorator, Color, Component, Node, Sprite, SpriteFrame, tween, UITransform, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('PersonCard')
export class PersonCard extends Component {
    @property([String]) public personIds: string[] = [];
    @property public isSuspect = false;
    @property({ tooltip: 'Marks this card as one of the final real-person reveals.' }) public isRealPerson = false;
    @property({ type: SpriteFrame, tooltip: 'Portrait shown when this mannequin is revealed as a real person.' }) public realPersonFrame: SpriteFrame | null = null;
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

    public get canRevealAsReal() {
        return !!this.realPersonFrame && (this.isRealPerson || this.personIds.indexOf('Real') !== -1);
    }

    public get revealRoot() {
        return this.sourceButton ?? this.node;
    }

    public revealAsReal(duration = 0.5, onComplete?: () => void) {
        const sourceSprite = this.getComponent(Sprite);
        const sourceTransform = this.getComponent(UITransform);
        if (!this.canRevealAsReal || !this.realPersonFrame || !sourceSprite || !sourceTransform) {
            onComplete?.();
            return;
        }

        const overlay = new Node('RealPortraitReveal');
        overlay.layer = this.node.layer;
        overlay.setParent(this.node);
        overlay.setPosition(Vec3.ZERO);
        overlay.setScale(Vec3.ONE);

        const overlayTransform = overlay.addComponent(UITransform);
        overlayTransform.setContentSize(sourceTransform.contentSize);
        overlayTransform.setAnchorPoint(sourceTransform.anchorPoint);

        const realSprite = overlay.addComponent(Sprite);
        realSprite.spriteFrame = this.realPersonFrame;
        realSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        realSprite.type = Sprite.Type.FILLED;
        realSprite.fillType = Sprite.FillType.HORIZONTAL;
        realSprite.fillStart = 0;
        realSprite.fillRange = 0;
        realSprite.color = sourceSprite.color.clone();

        tween(realSprite)
            .to(duration, { fillRange: 1 }, { easing: 'sineInOut' })
            .call(() => {
                sourceSprite.spriteFrame = this.realPersonFrame;
                overlay.destroy();
                onComplete?.();
            })
            .start();
    }

    public hideSourceButton() {
        if (this.sourceButton && this.sourceButton !== this.node) this.sourceButton.active = false;
    }

    public showSourceButton() {
        if (this.sourceButton && this.sourceButton !== this.node) this.sourceButton.active = true;
    }
}
