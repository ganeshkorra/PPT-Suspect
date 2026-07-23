// FILE: /assets/Scripts/TutorialController.ts (Corrected and Safer)

import { _decorator, Color, Component, Node, tween, v3, Vec3, Tween, SpriteFrame, Sprite, UITransform, UIOpacity } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TutorialController')
export class TutorialController extends Component {
    @property({ type: Node, tooltip: "The hand sprite node that will be animated." })
    public handNode: Node | null = null;

    @property({ type: SpriteFrame, tooltip: "The sprite for the idle/pointing hand." })
    public idleHandSprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: "The sprite for the hand when it is 'clicked down'." })
    public clickHandSprite: SpriteFrame | null = null;

    @property({ type: Node, tooltip: "Optional node to use as a ghost preview for the drag tutorial." })
    public tutorialGhost: Node | null = null;

    private handTween: Tween<Node> | null = null;
    private ghostNode: Node | null = null;

    public playTutorial(startNode: Node, endNode: Node): void {
        if (!this.idleHandSprite || !this.clickHandSprite) return;
        
        // --- ADDED SAFETY CHECK ---
        // Ensure nodes are valid when starting the tutorial
        if (!startNode || !endNode || !startNode.isValid || !endNode.isValid) return;

        const resolvedHand = this.getHandNode();
        if (!resolvedHand) return;
        this.handNode = resolvedHand;
        this.handNode.active = true;
        this.prepareTutorialGhost(startNode);
        this.runAnimationLoop(startNode, endNode);
    }

    public stopTutorial(): void {
        if (this.handTween) {
            this.handTween.stop();
            this.handTween = null;
        }
        if (this.ghostNode) {
            Tween.stopAllByTarget(this.ghostNode);
            this.ghostNode.active = false;
        }
        if (this.handNode) {
            this.handNode.active = false;
        }
    }

    private prepareTutorialGhost(startNode: Node): void {
        if (!startNode || !startNode.isValid) return;

        if (this.tutorialGhost && this.tutorialGhost.isValid) {
            this.ghostNode = this.tutorialGhost;
        }

        if (!this.ghostNode || !this.ghostNode.isValid) {
            this.ghostNode = this.createGhostForNode(startNode);
        }

        if (this.ghostNode) {
            this.updateGhostGraphic(this.ghostNode, startNode);
            this.ghostNode.active = false;
        }
    }

    private createGhostForNode(sourceNode: Node): Node | null {
        const ghostParent = this.getHandNode()?.parent ?? this.node;
        if (!ghostParent) return null;

        const ghost = new Node('TutorialGhost');
        ghost.parent = ghostParent;
        ghost.active = false;
        ghost.addComponent(UITransform);

        return ghost;
    }

    private updateGhostGraphic(ghostNode: Node, sourceNode: Node): void {
        const sourceSprite = this.findSprite(sourceNode);
        if (!sourceSprite) return;

        let ghostSprite = ghostNode.getComponent(Sprite);
        if (!ghostSprite) {
            ghostSprite = ghostNode.addComponent(Sprite);
        }
        ghostSprite.spriteFrame = sourceSprite.spriteFrame;
        ghostSprite.color = new Color(sourceSprite.color.r, sourceSprite.color.g, sourceSprite.color.b, 180);
        ghostSprite.sizeMode = sourceSprite.sizeMode;
        ghostSprite.type = sourceSprite.type;
        ghostSprite.trim = sourceSprite.trim;

        const sourceTransform = this.findTransform(sourceNode);
        if (sourceTransform) {
            const ghostTransform = ghostNode.getComponent(UITransform) ?? ghostNode.addComponent(UITransform);
            ghostTransform.setContentSize(sourceTransform.contentSize);
            ghostTransform.anchorPoint = sourceTransform.anchorPoint.clone();
        }
    }

    private findSprite(node: Node): Sprite | null {
        const sprite = node.getComponent(Sprite);
        if (sprite) return sprite;
        for (const child of node.children) {
            const childSprite = this.findSprite(child);
            if (childSprite) return childSprite;
        }
        return null;
    }

    private findTransform(node: Node): UITransform | null {
        const transform = node.getComponent(UITransform);
        if (transform) return transform;
        for (const child of node.children) {
            const childTransform = this.findTransform(child);
            if (childTransform) return childTransform;
        }
        return null;
    }

    private runAnimationLoop(startNode: Node, endNode: Node): void {
        const handNode = this.getHandNode();
        const handSprite = handNode?.getComponent(Sprite);
        if (!handNode || !handSprite) return;

        if (!startNode.isValid || !endNode.isValid) {
            this.stopTutorial();
            return;
        }

        const startWorld = startNode.worldPosition.clone();
        const endWorld = endNode.worldPosition.clone();
        const ghost = this.ghostNode && this.ghostNode.isValid ? this.ghostNode : null;

        if (ghost) {
            ghost.active = true;
            ghost.setSiblingIndex((ghost.parent?.children.length ?? 1) - 1);
            ghost.setWorldPosition(startWorld);
            ghost.setScale(startNode.worldScale);
            const ghostOpacity = ghost.getComponent(UIOpacity) ?? ghost.addComponent(UIOpacity);
            ghostOpacity.opacity = 180;
        }

        const handXOffset = 42;
        const handYOffset = -64;
        const idleLift = 16;
        const handIdlePosition = new Vec3(startWorld.x + handXOffset, startWorld.y + handYOffset + idleLift, startWorld.z);
        const handGrabPosition = new Vec3(startWorld.x + handXOffset, startWorld.y + handYOffset, startWorld.z);
        const handDropPosition = new Vec3(endWorld.x + handXOffset, endWorld.y + handYOffset, endWorld.z);
        const endIdlePosition = new Vec3(endWorld.x + handXOffset, endWorld.y + handYOffset + idleLift, endWorld.z);

        handNode.setWorldPosition(handIdlePosition);
        handNode.setSiblingIndex((handNode.parent?.children.length ?? 1) - 1);
        handSprite.spriteFrame = this.idleHandSprite;

        if (ghost) {
            tween(ghost)
                .delay(0.3)
                .to(0.95, { worldPosition: endWorld }, { easing: 'sineInOut' })
                .call(() => {
                    if (ghost && ghost.isValid) ghost.active = false;
                })
                .start();
        }

        this.handTween = tween(handNode)
            .delay(0.3)
            .call(() => {
                handSprite.spriteFrame = this.clickHandSprite!;
                handNode.setWorldPosition(handGrabPosition);
            })
            .delay(0.12)
            .to(0.95, { worldPosition: handDropPosition }, { easing: 'sineInOut' })
            .delay(0.06)
            .call(() => {
                handSprite.spriteFrame = this.idleHandSprite!;
                handNode.setWorldPosition(endIdlePosition);
            })
            .delay(0.4)
            .call(() => this.runAnimationLoop(startNode, endNode))
            .start();
    }
    
    private getUIPosition(targetNode: Node): Vec3 | null {
        const referenceNode = this.getHandNode()?.parent;
        
        // --- ADDED SAFETY CHECK ---
        if (!referenceNode || !targetNode.isValid) return null;

        const refUIT = referenceNode.getComponent(UITransform);
        const targetUIT = targetNode.getComponent(UITransform);
        if (!refUIT || !targetUIT) return null;

        const worldPos = targetUIT.convertToWorldSpaceAR(v3(0, 0, 0));
        return refUIT.convertToNodeSpaceAR(worldPos);
    }

    private getHandNode(): Node | null {
        if (this.handNode && this.handNode.isValid) return this.handNode;
        const sprite = this.findSprite(this.node);
        if (sprite) return sprite.node;
        if (this.node.isValid) return this.node;
        return null;
    }
}
