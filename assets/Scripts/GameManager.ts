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
    @property public initialTutorialDelay = 1.2; // earlier show for initial tutorial
    @property public gameDuration = 45;
    @property(Label) public timerLabel: Label | null = null;
    @property(Node) public failScreen: Node | null = null;
    // @property(Node) public killerNode: Node | null = null;
    @property(Node) public ctaNode: Node | null = null;

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
    @property public idleHintDelay = 7; // seconds before showing idle hint after game starts
    private readonly idleTimeoutCallback = () => this.handleIdleTimeout();
    private readonly timerTick = () => this.updateTimerLabel();
    private readonly timerExpired = () => this.failLevel();

    private findNodeInSceneByName(name: string): Node | null {
        const scene = director.getScene();
        if (!scene) return null;
        const stack: Node[] = [scene];
        while (stack.length) {
            const node = stack.pop()!;
            if (node.name && node.name.toLowerCase() === name.toLowerCase()) return node;
            for (const child of node.children) stack.push(child);
        }
        return null;
    }

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
        try { this.unschedule(this.idleTimeoutCallback); } catch (e) { /* ignore */ }
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
        this.scheduleOnce(() => this.showTutorial(true), this.initialTutorialDelay);
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

    private showTutorial(showText = false) {
        const tutorialText = this.tutorialText;
        const tutorialRoot = this.tutorialHand;
        const tutorialTarget = this.tutorialHandTarget ?? this.getTutorialPersonCard()?.node ?? null;
        const dropTarget = this.tutorialDropTarget ?? this.witnesses[this.currentWitnessIndex]?.innocentSlots[0] ?? null;
        const tutorialController = tutorialRoot?.getComponent(TutorialController) ?? null;
        if (!tutorialRoot || !tutorialController || !tutorialTarget || !dropTarget) {
            this.locked = false;
            return;
        }

        this.tutorialActive = true;
        tutorialRoot.active = true;

        if (showText && tutorialText) {
            tutorialText.active = true;
            const textOpacity = tutorialText.getComponent(UIOpacity) ?? tutorialText.addComponent(UIOpacity);
            const textScale = tutorialText.scale.clone();

            // show text immediately (no long delays)
            textOpacity.opacity = 0;
            tutorialText.setScale(textScale.x * 0.9, textScale.y * 0.9, textScale.z);
            tween(textOpacity).to(0.22, { opacity: 255 }, { easing: 'sineOut' }).start();
            tween(tutorialText)
                .to(0.28, { scale: new Vec3(textScale.x * 1.02, textScale.y * 1.02, textScale.z) }, { easing: 'backOut' })
                .to(0.16, { scale: textScale }, { easing: 'sineOut' })
                .start();

            const pulseScale = new Vec3(textScale.x * 1.03, textScale.y * 1.03, textScale.z);
            this.scheduleOnce(() => {
                tween(tutorialText)
                    .repeatForever(
                        tween()
                            .to(0.4, { scale: pulseScale }, { easing: 'sineInOut' })
                            .to(0.4, { scale: textScale }, { easing: 'sineInOut' }),
                    )
                    .start();
            }, 0.44);
        } else if (tutorialText) {
            // ensure tutorial text remains hidden during idle hint
            tutorialText.active = false;
        }

        // start tutorial hand animation immediately
        tutorialController.playTutorial(tutorialTarget, dropTarget);
        // unlock quickly so user can interact with hint
        this.locked = false;
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
        // start/reset idle hint timer when gameplay begins
        this.resetIdleTimer();
    }

    private resetIdleTimer() {
        if (this.gameFinished) return;
        // cancel previous
        try { this.unschedule(this.idleTimeoutCallback); } catch (e) { /* ignore */ }
        // schedule hint after idleHintDelay seconds
        this.scheduleOnce(this.idleTimeoutCallback, this.idleHintDelay);
    }

    private handleIdleTimeout() {
        if (this.gameFinished || this.tutorialActive) return;
        // If player is actively dragging, don't show hint
        if (this.draggedCard) {
            this.resetIdleTimer();
            return;
        }
        this.showIdleHint();
    }

    private showIdleHint() {
        const witness = this.witnesses[this.currentWitnessIndex];
        if (!witness) return;

        // find a person card that matches required ids and is not locked in a slot
        const hintCard = this.personCards.find((card) => card.matches(witness.requiredPersonIds) && card.node.active && !card.isLockedInSlot);
        // find an empty innocent slot
        const dropTarget = witness.innocentSlots.find((slot) => !this.slotOccupants.get(slot));
        if (!hintCard || !dropTarget) return;

        // set tutorial targets and show tutorial hand
        this.tutorialHandTarget = hintCard.node;
        this.tutorialDropTarget = dropTarget;
        this.showTutorial();
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
        try { this.unschedule(this.idleTimeoutCallback); } catch (e) { /* ignore */ }
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
        this.resetIdleTimer();
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
        // user moved pointer; reset idle timer so hint won't show
        if (this.draggedCard) this.resetIdleTimer();
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
        this.resetIdleTimer();
        const witness = this.witnesses[this.currentWitnessIndex];
        const slot = this.findSlot(witness, event.getUILocation().x, event.getUILocation().y);
        if (!slot) {
            // If player dropped the suspect onto the win area (winScreen/Guilty), finish the match
            const x = event.getUILocation().x;
            const y = event.getUILocation().y;
            if (card && card.isSuspect && this.winScreen) {
                const transform = this.winScreen.getComponent(UITransform);
                if (this.winScreen.activeInHierarchy && transform) {
                    const pos = this.winScreen.worldPosition;
                    const withinX = Math.abs(x - pos.x) <= transform.width * Math.abs(this.winScreen.worldScale.x) / 2;
                    const withinY = Math.abs(y - pos.y) <= transform.height * Math.abs(this.winScreen.worldScale.y) / 2;
                    if (withinX && withinY) {
                        // Attach card to winScreen for visual feedback
                        card.node.setParent(this.winScreen, true);
                        card.node.setPosition(Vec3.ZERO);
                        card.hideSourceButton();
                        this.slotOccupants.set(this.winScreen, card);
                        card.setLockedInSlot(true);
                        this.finishMatchAndShowCTA();
                        return;
                    }
                }
            }
            return this.returnCardHome(card);
        }
        this.placeCard(card, slot, witness);
    }

    private startDragging(card: PersonCard) {
        this.removeCardFromSlot(card);
        this.draggedCard = card;
        card.setIncorrect(false);
        card.node.setParent(this.node, true);
        card.node.setSiblingIndex(this.node.children.length - 1);
        this.resetIdleTimer();
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
            // If the placed card is the suspect, finish the level immediately and show CTA
            if (card.isSuspect) {
                this.finishMatchAndShowCTA();
                return;
            }
            // Reset idle timer after successful placement
            this.resetIdleTimer();
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
        this.finishMatchAndShowCTA();
    }

    private finishMatchAndShowCTA() {
        if (this.gameFinished) return;
        this.gameFinished = true;
        this.locked = true;
        this.stopGameTimer();
        this.hideTutorial();
        try { this.unschedule(this.idleTimeoutCallback); } catch (e) { /* ignore */ }
        console.log('GameManager: finishMatchAndShowCTA - showing CTA');
        this.showCTA();
    }

    private showKillerThenCTA() {
        // Killer reveal removed per design — trigger CTA immediately instead.
        this.showCTA();
    }

    private showCTA() {
        if (this.ctaShown) return;
        this.ctaShown = true;
        console.log('GameManager: showCTA called');
        const uiCanvas = director.getScene()?.getChildByName('Canvas') ?? this.findNodeInSceneByName('Canvas');

        let ctaCanvas = this.ctaNode
            ?? director.getScene()?.getChildByName('CTA')
            ?? this.findNodeInSceneByName('CTA')
            ?? this.findNodeInSceneByName('cta')
            ?? null;

        if (!ctaCanvas) {
            console.log('GameManager: CTA node not found — creating visible runtime CTA.');
            // create a more visible runtime CTA so the endscreen always appears
            ctaCanvas = new Node('CTA_runtime');
            if (uiCanvas) uiCanvas.addChild(ctaCanvas);
            else director.getScene()?.addChild(ctaCanvas);

            // Ensure the runtime CTA covers the center area and is visible
            ctaCanvas.setScale(1, 1, 1);

            // Big headline label
            const headline = new Node('CTA_Headline');
            headline.setParent(ctaCanvas);
            const hl = headline.addComponent(Label);
            hl.string = 'Play Now';
            try { (hl as any).fontSize = 64; } catch (e) { /* fallback */ }
            hl.color = new Color(255, 255, 255);
            headline.setPosition(0, 0, 0);

            // Subtext label
            const sub = new Node('CTA_Subtext');
            sub.setParent(ctaCanvas);
            const sl = sub.addComponent(Label);
            sl.string = 'Tap to continue';
            try { (sl as any).fontSize = 32; } catch (e) { /* fallback */ }
            sl.color = new Color(230, 230, 230);
            sub.setPosition(0, -72, 0);

            // Make the runtime CTA clickable: tapping will try to call CTAButtonHandler if present
            ctaCanvas.on(Node.EventType.TOUCH_END, () => {
                console.log('GameManager: runtime CTA tapped');
                let handlerComp: Component | null = null;

                // Try common locations first
                const ctaNode = this.ctaNode ?? this.findNodeInSceneByName('CTA') ?? director.getScene()?.getChildByName('CTA');
                if (ctaNode) handlerComp = ctaNode.getComponent('CTAButtonHandler') as Component | null;

                // If not found, search the entire scene for a component named 'CTAButtonHandler'
                if (!handlerComp) {
                    const scene = director.getScene();
                    if (scene) {
                        const stack: Node[] = [scene];
                        while (stack.length && !handlerComp) {
                            const node = stack.pop()!;
                            const comp = node.getComponent('CTAButtonHandler') as Component | null;
                            if (comp) { handlerComp = comp; break; }
                            for (const ch of node.children) stack.push(ch);
                        }
                    }
                }

                if (handlerComp && typeof (handlerComp as any).onCTA === 'function') {
                    try { (handlerComp as any).onCTA(); }
                    catch (e) { console.warn('GameManager: CTA handler call failed', e); }
                } else {
                    console.log('GameManager: CTA handler not found; runtime CTA tapped.');
                }
            }, this);
        }

        // Ensure CTA is parented under Canvas (so Widgets/Anchors work)
        try {
            if (uiCanvas && ctaCanvas.parent !== uiCanvas) ctaCanvas.setParent(uiCanvas!, true);
            // Bring CTA to front
            if (ctaCanvas.parent) ctaCanvas.setSiblingIndex(ctaCanvas.parent.children.length - 1);
        } catch (e) {
            console.warn('GameManager: failed to reparent/move CTA', e);
        }

        console.log('GameManager: showing CTA node', ctaCanvas.name);

        // Ensure visibility: enable node, children, and opacities
        ctaCanvas.active = true;
        const ownOpacity = ctaCanvas.getComponent(UIOpacity) ?? ctaCanvas.addComponent(UIOpacity);
        ownOpacity.opacity = 255;
        for (const child of ctaCanvas.children) {
            child.active = true;
            const op = child.getComponent(UIOpacity) ?? child.addComponent(UIOpacity);
            op.opacity = 255;
            // ensure reasonable scale/position
            if (child.scale.x === 0 || child.scale.y === 0) child.setScale(1, 1, 1);
        }

        // show backdrop and fade-in
        const backdrop = ctaCanvas.getChildByName('SpriteSplash') ?? ctaCanvas;
        backdrop.active = true;
        const backdropOpacity = backdrop.getComponent(UIOpacity) ?? backdrop.addComponent(UIOpacity);
        backdropOpacity.opacity = 0;
        tween(backdropOpacity).to(0.38, { opacity: 255 }, { easing: 'sineOut' }).start();

        // Reveal CTA children safely
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
