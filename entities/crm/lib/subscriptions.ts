// What the composition root registers when crm is installed.
//
// Nothing here registers itself on import — the composition root calls this
// for the entities a deployment includes, because an entity that subscribed at
// module scope would make registration depend on load order (docs/adr/0003).
import { subscribe } from "@/kernel/events";
import { markAccountCustomerOnPayment } from "./invoice-subscriptions";

export function subscriptions(): void {
  // An invoice was paid: the account that paid it is a customer, whether or
  // not a deal was ever won for them.
  subscribe("crm", "invoice.paid", markAccountCustomerOnPayment);
}
