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

interface PresentationState {
    position: Vec3;
    scale: Vec3;
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
    private readonly presentationStates = new Map<Node, PresentationState>();
    private currentWitnessIndex = 0;
    private pressedCard: PersonCard | null = null;
    private pressPosition = new Vec3();
    private draggedCard: PersonCard | null = null;
    private locked = false;

    start() {
        this.locked = true;
        this.personCards.forEach((card) => this.registerCard(card));
        this.witnesses.forEach((witness, index) => witness.configure(index === 0, false));
        this.witnesses.forEach((witness) => {
            if (witness.witnessRoot) witness.witnessRoot.active = true;
        });
        this.prepareGameplayPresentation();
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
            this.playGameplayPresentation();
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
            this.playGameplayPresentation();
        }, this.introDuration);
    }

    private prepareGameplayPresentation() {
        const suspectPanel = this.getSuspectPanel();
        if (suspectPanel) this.preparePresentationNode(suspectPanel, 0, 0.96);
        this.personCards.forEach((card) => this.preparePresentationNode(card.node, -26, 0.82));
        this.witnesses.forEach((witness) => {
            if (witness.witnessRoot?.active) this.preparePresentationNode(witness.witnessRoot, 20, 0.9);
            witness.clueElements.forEach((clue) => clue.active = false);
        });
        this.getCurrentSlotPanels().forEach((panel) => this.preparePresentationNode(panel, 18, 0.93));
    }

    private playGameplayPresentation() {
        const suspectPanel = this.getSuspectPanel();
        if (suspectPanel) this.playPresentationNode(suspectPanel, 0, 0.28);
        this.personCards.forEach((card, index) => this.playPresentationNode(card.node, 0.14 + index * 0.055, 0.24));
        this.witnesses.forEach((witness, index) => {
            if (witness.witnessRoot) this.playPresentationNode(witness.witnessRoot, 0.82 + index * 0.18, 0.3);
        });
        this.getCurrentSlotPanels().forEach((panel, index) => this.playPresentationNode(panel, 1.48 + index * 0.06, 0.34));
        this.scheduleOnce(() => this.revealCurrentClue(), 1.98);
        this.scheduleOnce(() => this.locked = false, 2.28);
    }

    private getSuspectPanel() {
        const firstCard = this.personCards[0];
        return firstCard?.sourceButton?.parent ?? firstCard?.node.parent ?? null;
    }

    private getCurrentSlotPanels() {
        const witness = this.witnesses[this.currentWitnessIndex];
        if (!witness) return [];
        return [...new Set(witness.innocentSlots.map((slot) => slot.parent).filter((panel): panel is Node => panel !== null))];
    }

    private preparePresentationNode(node: Node, offsetX: number, scaleMultiplier: number) {
        if (!node.active) return;
        const state = { position: node.position.clone(), scale: node.scale.clone() };
        this.presentationStates.set(node, state);
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        opacity.opacity = 0;
        node.setPosition(state.position.x + offsetX, state.position.y, state.position.z);
        node.setScale(state.scale.x * scaleMultiplier, state.scale.y * scaleMultiplier, state.scale.z);
    }

    private playPresentationNode(node: Node, delay: number, duration: number) {
        const state = this.presentationStates.get(node);
        if (!state) return;
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        tween(opacity).delay(delay).to(Math.min(0.22, duration), { opacity: 255 }, { easing: 'sineOut' }).start();
        tween(node)
            .delay(delay)
            .to(duration, { position: state.position, scale: state.scale }, { easing: 'quadOut' })
            .start();
    }

    private revealCurrentClue(dramatic = false) {
        const witness = this.witnesses[this.currentWitnessIndex];
        if (!witness) return;
        witness.clueElements.forEach((clue) => {
            clue.active = true;
            const finalScale = clue.scale.clone();
            const finalPosition = clue.position.clone();
            const opacity = clue.getComponent(UIOpacity) ?? clue.addComponent(UIOpacity);
            opacity.opacity = 0;
            clue.setScale(finalScale.x * (dramatic ? 0.52 : 0.94), finalScale.y * (dramatic ? 0.52 : 0.94), finalScale.z);
            if (dramatic) clue.setPosition(finalPosition.x + 110, finalPosition.y, finalPosition.z);
            tween(opacity).to(0.2, { opacity: 255 }, { easing: 'sineOut' }).start();
            const clueTween = tween(clue)
                .to(0.32, {
                    position: finalPosition,
                    scale: new Vec3(finalScale.x * (dramatic ? 1.1 : 1), finalScale.y * (dramatic ? 1.1 : 1), finalScale.z),
                }, { easing: dramatic ? 'backOut' : 'quadOut' });
            if (dramatic) clueTween.to(0.16, { scale: finalScale }, { easing: 'sineOut' });
            clueTween
                .call(() => {
                    tween(clue)
                        .repeatForever(
                            tween()
                                .to(0.55, { scale: new Vec3(finalScale.x * 1.025, finalScale.y * 1.025, finalScale.z) }, { easing: 'sineInOut' })
                                .to(0.55, { scale: finalScale }, { easing: 'sineInOut' }),
                        )
                        .start();
                })
                .start();
        });
    }

    private playWitnessReveal(witness: WitnessCase | undefined, delay: number, dramatic = false) {
        if (!witness) return;
        if (witness.witnessRoot) {
            if (dramatic) this.playBurstNode(witness.witnessRoot, delay);
            else this.playPresentationNode(witness.witnessRoot, delay, 0.32);
        }
        this.getCurrentSlotPanels().forEach((panel, index) => {
            if (dramatic) this.playBurstNode(panel, delay + 0.3 + index * 0.07);
            else this.playPresentationNode(panel, delay + 0.34 + index * 0.06, 0.34);
        });
        this.scheduleOnce(() => this.revealCurrentClue(dramatic), delay + (dramatic ? 0.76 : 0.78));
        this.scheduleOnce(() => this.locked = false, delay + (dramatic ? 1.18 : 1.08));
    }

    private prepareBurstNode(node: Node, offsetX: number, offsetY: number, scaleMultiplier: number) {
        if (!node.active) return;
        const state = { position: node.position.clone(), scale: node.scale.clone() };
        this.presentationStates.set(node, state);
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        opacity.opacity = 0;
        node.setPosition(state.position.x + offsetX, state.position.y + offsetY, state.position.z);
        node.setScale(state.scale.x * scaleMultiplier, state.scale.y * scaleMultiplier, state.scale.z);
    }

    private playBurstNode(node: Node, delay: number) {
        const state = this.presentationStates.get(node);
        if (!state) return;
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        tween(opacity).delay(delay).to(0.13, { opacity: 255 }, { easing: 'sineOut' }).start();
        tween(node)
            .delay(delay)
            .to(0.27, {
                position: state.position,
                scale: new Vec3(state.scale.x * 1.08, state.scale.y * 1.08, state.scale.z),
            }, { easing: 'backOut' })
            .to(0.15, { scale: state.scale }, { easing: 'sineOut' })
            .start();
    }

    private playWitnessExit(witness: WitnessCase, onComplete: () => void) {
        const nodes = [witness.witnessRoot, ...this.getCurrentSlotPanels()].filter((node): node is Node => node !== null);
        nodes.forEach((node, index) => {
            const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
            const position = node.position.clone();
            const scale = node.scale.clone();
            tween(node)
                .delay(index * 0.04)
                .to(0.1, { scale: new Vec3(scale.x * 1.08, scale.y * 1.08, scale.z) }, { easing: 'quadOut' })
                .to(0.26, { position: new Vec3(position.x - 130, position.y + 42, position.z), scale: new Vec3(scale.x * 0.65, scale.y * 0.65, scale.z) }, { easing: 'backIn' })
                .start();
            tween(opacity).delay(0.1 + index * 0.04).to(0.24, { opacity: 0 }, { easing: 'sineIn' }).start();
        });
        this.scheduleOnce(onComplete, 0.42);
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
        this.playWitnessExit(witness, () => {
            witness.complete();
            this.currentWitnessIndex++;
            const nextWitness = this.witnesses[this.currentWitnessIndex];
            if (nextWitness) {
                nextWitness.configure(true, false);
                if (nextWitness.witnessRoot) this.prepareBurstNode(nextWitness.witnessRoot, 160, -34, 0.58);
                this.getCurrentSlotPanels().forEach((panel) => this.prepareBurstNode(panel, -150, -70, 0.7));
                this.playWitnessReveal(nextWitness, 0.08, true);
                return;
            }
            this.showSuspect();
        });
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
