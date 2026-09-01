import { EndCredit, Widget } from "generated/prisma/client";

export interface EndCreditWidget extends EndCredit {
    widget: Widget;
}
