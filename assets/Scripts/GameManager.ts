import { _decorator, Color, Component, EventTouch, Node, Sprite, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { PersonCard } from './PersonCard';
import { WitnessCase } from './WitnessCase';

const { ccclass, property } = _decorator;

interface CardHome {
    parent: Node;
    position: Vec3;
    scale: Vec3;
    siblingIndex: number;
}

@ccclass('GameManager')
export class GameManager extends Component {
    @property([PersonCard]) public personCards: PersonCard[] = [];
    @property([WitnessCase]) public witnesses: WitnessCase[] = [];
    @property(Node) public winScreen: Node | null = null;
    @property(Node) public introCanvas: Node | null = null;
    @property(Node) public introContent: Node | null = null;
    @property(Node) public introText: Node | null = null;
    @property public introDuration = 3;

    private readonly cardHomes = new Map<PersonCard, CardHome>();
    private readonly slotOccupants = new Map<Node, PersonCard>();
    private readonly slotColors = new Map<Node, Color>();
    private currentWitnessIndex = 0;
    private pressedCard: PersonCard | null = null;
    private pressPosition = new Vec3();
    private draggedCard: PersonCard | null = null;
    private locked = false;

    start() {
        this.locked = true;
        this.personCards.forEach((card) => this.registerCard(card));
        this.witnesses.forEach((witness, index) => witness.configure(index === 0));
        this.showIntro();
    }

    onDestroy() {
        this.personCards.forEach((card) => {
            card.node.off(Node.EventType.TOUCH_START, this.beginDrag, this);
            card.node.off(Node.EventType.TOUCH_MOVE, this.onCardMove, this);
            card.node.off(Node.EventType.TOUCH_END, this.onCardEnd, this);
            card.node.off(Node.EventType.TOUCH_CANCEL, this.onCardEnd, this);
        });
    }

    private registerCard(card: PersonCard) {
        if (!card || !card.node.parent) return;
        this.cardHomes.set(card, {
            parent: card.node.parent,
            position: card.node.position.clone(),
            scale: card.node.scale.clone(),
            siblingIndex: card.node.getSiblingIndex(),
        });
        card.node.on(Node.EventType.TOUCH_START, this.beginDrag, this);
        card.node.on(Node.EventType.TOUCH_MOVE, this.onCardMove, this);
        card.node.on(Node.EventType.TOUCH_END, this.onCardEnd, this);
        card.node.on(Node.EventType.TOUCH_CANCEL, this.onCardEnd, this);
    }

    private showIntro() {
        const introCanvas = this.introCanvas;
        if (!introCanvas) {
            this.locked = false;
            return;
        }

        introCanvas.active = true;
        const canvasOpacity = introCanvas.getComponent(UIOpacity) ?? introCanvas.addComponent(UIOpacity);
        const contentNode = this.introContent ?? introCanvas;
        const contentScale = contentNode.scale.clone();
        const textNode = this.introText;
        canvasOpacity.opacity = 0;
        contentNode.setScale(contentScale.x * 1.035, contentScale.y * 1.035, contentScale.z);
        tween(canvasOpacity).to(0.5, { opacity: 255 }, { easing: 'sineOut' }).start();
        tween(contentNode).to(1.35, { scale: contentScale }, { easing: 'sineOut' }).start();

        if (textNode) {
            const finalScale = textNode.scale.clone();
            const finalPosition = textNode.position.clone();
            const textOpacity = textNode.getComponent(UIOpacity) ?? textNode.addComponent(UIOpacity);
            textOpacity.opacity = 0;
            textNode.setScale(finalScale.x * 0.94, finalScale.y * 0.94, finalScale.z);
            textNode.setPosition(finalPosition.x, finalPosition.y - 22, finalPosition.z);
            tween(textNode)
                .delay(0.48)
                .to(0.42, {
                    position: finalPosition,
                    scale: new Vec3(finalScale.x * 1.025, finalScale.y * 1.025, finalScale.z),
                }, { easing: 'quadOut' })
                .to(0.25, { scale: finalScale }, { easing: 'sineOut' })
                .delay(0.34)
                .to(0.32, { scale: new Vec3(finalScale.x * 1.015, finalScale.y * 1.015, finalScale.z) }, { easing: 'sineInOut' })
                .to(0.38, { scale: finalScale }, { easing: 'sineInOut' })
                .start();
            tween(textOpacity).delay(0.48).to(0.38, { opacity: 255 }, { easing: 'sineOut' }).start();
        }

        this.scheduleOnce(() => {
            tween(contentNode).to(0.4, { scale: new Vec3(contentScale.x * 1.015, contentScale.y * 1.015, contentScale.z) }, { easing: 'sineIn' }).start();
            tween(canvasOpacity).to(0.42, { opacity: 0 }, { easing: 'sineIn' }).start();
            if (textNode) {
                const textOpacity = textNode.getComponent(UIOpacity)!;
                tween(textOpacity).to(0.28, { opacity: 0 }, { easing: 'sineIn' }).start();
            }
        }, Math.max(0.2, this.introDuration - 0.42));
        this.scheduleOnce(() => {
            introCanvas.active = false;
            this.locked = false;
        }, this.introDuration);
    }

    private beginDrag(event: EventTouch) {
        if (this.locked || this.currentWitnessIndex >= this.witnesses.length) return;
        const card = (event.currentTarget as Node).getComponent(PersonCard);
        if (!card || !card.node.active || card.isLockedInSlot) return;
        const location = event.getUILocation();
        this.pressedCard = card;
        this.pressPosition.set(location.x, location.y, 0);
    }

    private onCardMove(event: EventTouch) {
        const eventCard = (event.currentTarget as Node).getComponent(PersonCard);
        if (!eventCard) return;
        const location = event.getUILocation();
        if (!this.draggedCard && this.pressedCard === eventCard) {
            const distanceX = location.x - this.pressPosition.x;
            const distanceY = location.y - this.pressPosition.y;
            if (distanceX * distanceX + distanceY * distanceY < 144) return;
            this.startDragging(eventCard);
            this.pressedCard = null;
        }
        if (this.draggedCard !== eventCard) return;
        this.draggedCard.node.setWorldPosition(location.x, location.y, this.draggedCard.node.worldPosition.z);
    }

    private onCardEnd(event: EventTouch) {
        const eventCard = (event.currentTarget as Node).getComponent(PersonCard);
        if (!eventCard) return;
        const card = this.draggedCard;
        if (this.pressedCard === eventCard) this.pressedCard = null;
        if (card !== eventCard) return;
        this.draggedCard = null;
        const witness = this.witnesses[this.currentWitnessIndex];
        const slot = this.findSlot(witness, event.getUILocation().x, event.getUILocation().y);
        if (!slot) return this.returnCardHome(card);
        this.placeCard(card, slot, witness);
    }

    private startDragging(card: PersonCard) {
        this.removeCardFromSlot(card);
        this.draggedCard = card;
        card.setIncorrect(false);
        card.node.setParent(this.node, true);
        card.node.setSiblingIndex(this.node.children.length - 1);
    }

    private findSlot(witness: WitnessCase, screenX: number, screenY: number): Node | null {
        for (const slot of witness.innocentSlots) {
            const transform = slot?.getComponent(UITransform);
            if (!slot || !slot.activeInHierarchy || !transform) continue;
            if (this.slotOccupants.get(slot)?.isLockedInSlot) continue;
            const position = slot.worldPosition;
            if (Math.abs(screenX - position.x) <= transform.width * Math.abs(slot.worldScale.x) / 2
                && Math.abs(screenY - position.y) <= transform.height * Math.abs(slot.worldScale.y) / 2) return slot;
        }
        return null;
    }

    private placeCard(card: PersonCard, slot: Node, witness: WitnessCase) {
        this.locked = true;
        const previousCard = this.slotOccupants.get(slot);
        if (previousCard && previousCard !== card) this.returnCardHome(previousCard, true);
        card.node.setParent(slot, true);
        card.hideSourceButton();
        this.slotOccupants.set(slot, card);

        if (!card.matches(witness.requiredPersonIds)) {
            card.setLockedInSlot(false);
            card.setIncorrect(false);
            this.setSlotIncorrect(slot, true);
            tween(card.node).to(0.16, { position: Vec3.ZERO }, { easing: 'quadOut' }).call(() => this.locked = false).start();
            return;
        }

        card.setIncorrect(false);
        this.setSlotIncorrect(slot, false);
        card.setLockedInSlot(true);
        tween(card.node).to(0.16, { position: Vec3.ZERO }, { easing: 'quadOut' }).call(() => {
            if (this.isWitnessComplete(witness)) this.completeWitness(witness);
            else this.locked = false;
        }).start();
    }

    private returnCardHome(card: PersonCard, animate = false) {
        const home = this.cardHomes.get(card);
        if (!home) return;
        card.setLockedInSlot(false);
        card.setIncorrect(false);
        card.showSourceButton();
        card.node.setParent(home.parent, true);
        card.node.setSiblingIndex(home.siblingIndex);
        if (animate) {
            tween(card.node).to(0.18, { position: home.position, scale: home.scale }, { easing: 'quadOut' }).start();
        } else {
            card.node.setPosition(home.position);
            card.node.setScale(home.scale);
        }
    }

    private removeCardFromSlot(card: PersonCard) {
        for (const [slot, occupant] of this.slotOccupants) {
            if (occupant === card) {
                this.slotOccupants.delete(slot);
                this.setSlotIncorrect(slot, false);
                return;
            }
        }
    }

    private setSlotIncorrect(slot: Node, isIncorrect: boolean) {
        const sprite = slot.getComponent(Sprite);
        if (!sprite) return;
        if (!this.slotColors.has(slot)) this.slotColors.set(slot, sprite.color.clone());
        sprite.color = isIncorrect ? new Color(220, 65, 65, 255) : this.slotColors.get(slot)!.clone();
    }

    private isWitnessComplete(witness: WitnessCase) {
        return witness.innocentSlots.length > 0
            && witness.innocentSlots.every((slot) => this.slotOccupants.get(slot)?.isLockedInSlot);
    }

    private completeWitness(witness: WitnessCase) {
        witness.complete();
        this.currentWitnessIndex++;
        const nextWitness = this.witnesses[this.currentWitnessIndex];
        if (nextWitness) {
            nextWitness.configure(true);
            this.locked = false;
            return;
        }
        this.showSuspect();
    }

    private showSuspect() {
        const suspect = this.personCards.find((card) => card.isSuspect);
        this.personCards.forEach((card) => {
            if (card !== suspect && card.node.active) card.node.active = false;
        });
        if (!suspect) return console.warn('GameManager: assign one PersonCard as the suspect.');
        this.locked = false;
        suspect.node.setParent(this.node, true);
        suspect.node.setSiblingIndex(this.node.children.length - 1);
        tween(suspect.node).repeatForever(tween().to(0.35, { scale: new Vec3(1.12, 1.12, 1) }).to(0.35, { scale: Vec3.ONE })).start();
        suspect.node.off(Node.EventType.TOUCH_START, this.beginDrag, this);
        suspect.node.on(Node.EventType.TOUCH_END, this.winLevel, this);
    }

    private winLevel() {
        if (this.locked) return;
        this.locked = true;
        if (this.winScreen) this.winScreen.active = true;
    }
}
