import { _decorator, Component, Node } from 'cc';
import { PersonCard } from './PersonCard';

const { ccclass, property } = _decorator;

@ccclass('WitnessCase')
export class WitnessCase extends Component {
    @property(Node) public witnessRoot: Node | null = null;
    @property([Node]) public clueElements: Node[] = [];
    @property([PersonCard]) public personCards: PersonCard[] = [];
    @property([Node]) public innocentSlots: Node[] = [];
    @property(Node) public revealButton: Node | null = null;
    @property([String]) public requiredPersonIds: string[] = [];
    @property public hideCluesUntilReveal = false;

    onLoad() {
        this.revealButton?.on(Node.EventType.TOUCH_END, this.revealClues, this);
    }

    onDestroy() {
        this.revealButton?.off(Node.EventType.TOUCH_END, this.revealClues, this);
    }

    public configure(isActive: boolean) {
        if (this.witnessRoot) this.witnessRoot.active = true;
        this.clueElements.forEach((element) => element.active = isActive && !this.hideCluesUntilReveal);
        if (this.revealButton) this.revealButton.active = isActive;
        if (isActive) {
            this.getSlotPanels().forEach((panel) => panel.active = true);
            this.innocentSlots.forEach((slot) => slot.active = true);
        }
    }

    private revealClues() {
        this.clueElements.forEach((element) => element.active = true);
        if (this.revealButton) this.revealButton.active = false;
    }

    private getSlotPanels() {
        return [...new Set(this.innocentSlots.map((slot) => slot.parent).filter((panel): panel is Node => panel !== null))];
    }

    public complete() {
        if (this.witnessRoot) this.witnessRoot.active = false;
        this.clueElements.forEach((element) => element.active = false);
        if (this.revealButton) this.revealButton.active = false;
        this.getSlotPanels().forEach((panel) => panel.active = false);
    }
}
