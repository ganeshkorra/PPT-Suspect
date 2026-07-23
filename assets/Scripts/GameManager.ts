import { _decorator, Color, Component, director, EventTouch, Label, Node, Sprite, Tween, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { PersonCard } from './PersonCard';
import { TutorialController } from './TutorialController';
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
    eulerAngles: Vec3;
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
    @property(Node) public tutorialText: Node | null = null;
    @property(Node) public tutorialHand: Node | null = null;
    @property(Node) public tutorialHandTarget: Node | null = null;
    @property(Node) public tutorialDropTarget: Node | null = null;
    @property public tutorialDuration = 2.5;
    @property public gameDuration = 45;
    @property(Label) public timerLabel: Label | null = null;
    @property(Node) public failScreen: Node | null = null;
    @property(Node) public killerNode: Node | null = null;

    private readonly cardHomes = new Map<PersonCard, CardHome>();
    private readonly slotOccupants = new Map<Node, PersonCard>();
    private readonly slotColors = new Map<Node, Color>();
    private readonly presentationStates = new Map<Node, PresentationState>();
    private currentWitnessIndex = 0;
    private pressedCard: PersonCard | null = null;
    private pressPosition = new Vec3();
    private draggedCard: PersonCard | null = null;
    private locked = false;
    private gameFinished = false;
    private tutorialActive = false;
    private remainingSeconds = 0;
    private timerStarted = false;
    private ctaShown = false;
    private readonly timerTick = () => this.updateTimerLabel();
    private readonly timerExpired = () => this.failLevel();

    start() {
        this.locked = true;
        if (this.timerLabel) this.timerLabel.string = `${Math.max(0, Math.ceil(this.gameDuration))}s`;
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
        this.unschedule(this.timerTick);
        this.unschedule(this.timerExpired);
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
        this.scheduleOnce(() => this.showTutorial(), 2.34);
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

    private getTutorialPersonCard(): PersonCard | null {
        const witness = this.witnesses[this.currentWitnessIndex];
        if (!witness) return null;
        const matching = this.personCards.find((card) => card.matches(witness.requiredPersonIds) && card.node.active && !card.isLockedInSlot);
        if (matching) return matching;
        return this.personCards.find((card) => card.node.active && !card.isSuspect) ?? null;
    }

    private preparePresentationNode(node: Node, offsetX: number, scaleMultiplier: number) {
        if (!node.active) return;
        const state = { position: node.position.clone(), scale: node.scale.clone(), eulerAngles: node.eulerAngles.clone() };
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
            .to(duration, { position: state.position, scale: state.scale, eulerAngles: state.eulerAngles }, { easing: 'quadOut' })
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

    private showTutorial() {
        const tutorialText = this.tutorialText;
        const tutorialRoot = this.tutorialHand;
        const tutorialTarget = this.tutorialHandTarget ?? this.getTutorialPersonCard()?.node ?? null;
        const dropTarget = this.tutorialDropTarget ?? this.witnesses[this.currentWitnessIndex]?.innocentSlots[0] ?? null;
        const tutorialController = tutorialRoot?.getComponent(TutorialController) ?? null;
        if (!tutorialText || !tutorialRoot || !tutorialController || !tutorialTarget || !dropTarget) {
            this.locked = false;
            return;
        }

        this.tutorialActive = true;
        tutorialText.active = true;
        tutorialRoot.active = true;
        const textOpacity = tutorialText.getComponent(UIOpacity) ?? tutorialText.addComponent(UIOpacity);
        const textScale = tutorialText.scale.clone();

        textOpacity.opacity = 0;
        tutorialText.setScale(textScale.x * 0.68, textScale.y * 0.68, textScale.z);

        tween(textOpacity).to(0.22, { opacity: 255 }, { easing: 'sineOut' }).start();
        tween(tutorialText)
            .to(0.28, { scale: new Vec3(textScale.x * 1.08, textScale.y * 1.08, textScale.z) }, { easing: 'backOut' })
            .to(0.16, { scale: textScale }, { easing: 'sineOut' })
            .delay(0.22)
            .to(0.2, { scale: new Vec3(textScale.x * 1.04, textScale.y * 1.04, textScale.z) }, { easing: 'sineInOut' })
            .to(0.2, { scale: textScale }, { easing: 'sineInOut' })
            .start();
        this.scheduleOnce(() => {
            tutorialController.playTutorial(tutorialTarget, dropTarget);
            this.locked = false;
        }, 1.68);
    }

    private hideTutorial() {
        if (!this.tutorialActive) return;
        this.tutorialActive = false;
        const tutorialText = this.tutorialText;
        const tutorialRoot = this.tutorialHand;
        const tutorialTarget = this.tutorialHandTarget;
        if (tutorialText) {
            Tween.stopAllByTarget(tutorialText);
            tutorialText.active = false;
        }
        if (tutorialRoot) {
            tutorialRoot.getComponent(TutorialController)?.stopTutorial();
            tutorialRoot.active = false;
        }
        if (tutorialTarget) {
            Tween.stopAllByTarget(tutorialTarget);
        }
    }


    private startGameTimer() {
        if (this.gameFinished || this.timerStarted) return;
        this.timerStarted = true;
        this.remainingSeconds = Math.max(1, Math.ceil(this.gameDuration));
        if (this.timerLabel) this.timerLabel.string = `${this.remainingSeconds}s`;
        this.schedule(this.timerTick, 1);
        this.scheduleOnce(this.timerExpired, this.remainingSeconds);
    }

    private updateTimerLabel() {
        if (this.remainingSeconds > 0) this.remainingSeconds--;
        if (this.timerLabel) this.timerLabel.string = `${Math.max(0, this.remainingSeconds)}s`;
    }

    private stopGameTimer() {
        this.unschedule(this.timerTick);
        this.unschedule(this.timerExpired);
    }

    private failLevel() {
        if (this.gameFinished) return;
        this.gameFinished = true;
        this.locked = true;
        this.stopGameTimer();
        this.hideTutorial();
        this.showCTA();
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

    private prepareBurstNode(node: Node, offsetX: number, offsetY: number, scaleMultiplier: number, rotationZ = 0) {
        if (!node.active) return;
        const state = { position: node.position.clone(), scale: node.scale.clone(), eulerAngles: node.eulerAngles.clone() };
        this.presentationStates.set(node, state);
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        opacity.opacity = 0;
        node.setPosition(state.position.x + offsetX, state.position.y + offsetY, state.position.z);
        node.setScale(state.scale.x * scaleMultiplier, state.scale.y * scaleMultiplier, state.scale.z);
        node.setRotationFromEuler(state.eulerAngles.x, state.eulerAngles.y, state.eulerAngles.z + rotationZ);
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
                eulerAngles: state.eulerAngles,
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
            const eulerAngles = node.eulerAngles.clone();
            tween(node)
                .delay(index * 0.04)
                .to(0.1, { scale: new Vec3(scale.x * 1.08, scale.y * 1.08, scale.z) }, { easing: 'quadOut' })
                .to(0.38, {
                    position: new Vec3(position.x + 145, position.y + 145, position.z),
                    scale: new Vec3(scale.x * 0.7, scale.y * 0.7, scale.z),
                    eulerAngles: new Vec3(eulerAngles.x, eulerAngles.y, eulerAngles.z - 18),
                }, { easing: 'quadIn' })
                .start();
            tween(opacity).delay(0.08 + index * 0.04).to(0.42, { opacity: 0 }, { easing: 'sineIn' }).start();
        });
        this.scheduleOnce(onComplete, 0.56);
    }

    private beginDrag(event: EventTouch) {
        if (this.locked || this.currentWitnessIndex >= this.witnesses.length) return;
        const card = (event.currentTarget as Node).getComponent(PersonCard);
        if (!card || !card.node.active || card.isLockedInSlot) return;
        this.startGameTimer();
        this.hideTutorial();
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
                if (nextWitness.witnessRoot) this.prepareBurstNode(nextWitness.witnessRoot, -90, 145, 0.66, 12);
                this.getCurrentSlotPanels().forEach((panel) => this.prepareBurstNode(panel, 70, 145, 0.76, -14));
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
        if (this.locked || this.gameFinished) return;
        this.gameFinished = true;
        this.locked = true;
        this.stopGameTimer();
        this.hideTutorial();
        this.showKillerThenCTA();
    }

    private showKillerThenCTA() {
        const killer = this.killerNode ?? this.node.parent?.getChildByName('Killer') ?? this.winScreen;
        if (!killer) {
            this.showCTA();
            return;
        }
        killer.active = true;
        const finalScale = killer.scale.clone();
        const opacity = killer.getComponent(UIOpacity) ?? killer.addComponent(UIOpacity);
        opacity.opacity = 0;
        killer.setScale(finalScale.x * 0.68, finalScale.y * 0.68, finalScale.z);
        tween(opacity).to(0.22, { opacity: 255 }, { easing: 'sineOut' }).start();
        tween(killer)
            .to(0.38, { scale: new Vec3(finalScale.x * 1.08, finalScale.y * 1.08, finalScale.z) }, { easing: 'backOut' })
            .to(0.2, { scale: finalScale }, { easing: 'sineOut' })
            .start();
        this.scheduleOnce(() => this.showCTA(), 1.2);
    }

    private showCTA() {
        if (this.ctaShown) return;
        this.ctaShown = true;
        const ctaCanvas = director.getScene()?.getChildByName('CTA') ?? null;
        if (!ctaCanvas) {
            if (this.failScreen) this.failScreen.active = true;
            return;
        }

        ctaCanvas.active = true;
        const backdrop = ctaCanvas.getChildByName('SpriteSplash') ?? ctaCanvas;
        backdrop.active = true;
        const backdropOpacity = backdrop.getComponent(UIOpacity) ?? backdrop.addComponent(UIOpacity);
        backdropOpacity.opacity = 0;
        tween(backdropOpacity).to(0.38, { opacity: 255 }, { easing: 'sineOut' }).start();
        this.revealCTAElement(ctaCanvas.getChildByName('Icon1024'), 0.24, 0.72);
        this.revealCTAElement(ctaCanvas.getChildByName('ProfilePerfect'), 0.56, 0.7);
        this.revealCTAElement(ctaCanvas.getChildByName('play now'), 0.9, 0.78, true);
    }

    private revealCTAElement(node: Node | null, delay: number, startScale: number, swing = false) {
        if (!node) return;
        node.active = true;
        const finalScale = node.scale.clone();
        const finalRotation = node.eulerAngles.clone();
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        opacity.opacity = 0;
        node.setScale(finalScale.x * startScale, finalScale.y * startScale, finalScale.z);
        tween(opacity).delay(delay).to(0.2, { opacity: 255 }, { easing: 'sineOut' }).start();
        tween(node)
            .delay(delay)
            .to(0.32, { scale: new Vec3(finalScale.x * 1.08, finalScale.y * 1.08, finalScale.z) }, { easing: 'backOut' })
            .to(0.16, { scale: finalScale }, { easing: 'sineOut' })
            .call(() => {
                if (!swing) return;
                tween(node)
                    .repeatForever(
                        tween()
                            .to(0.35, { eulerAngles: new Vec3(finalRotation.x, finalRotation.y, finalRotation.z - 7) }, { easing: 'sineInOut' })
                            .to(0.7, { eulerAngles: new Vec3(finalRotation.x, finalRotation.y, finalRotation.z + 7) }, { easing: 'sineInOut' })
                            .to(0.35, { eulerAngles: finalRotation }, { easing: 'sineInOut' }),
                    )
                    .start();
            })
            .start();
    }
}
