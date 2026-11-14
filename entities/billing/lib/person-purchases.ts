import { readOr } from "@/kernel/data/read";
import type { PersonPurchases } from "../slots";
import { bookingsOfPerson } from "./bookings";
import { ordersOfPerson } from "./orders";

/**
 * A person's orders and bookings, newest first: the personPurchases slot that
 * crm's contact page takes (ADR 0032). A failed read lists none, which is what
 * the page has always shown for one; the failure is logged.
 */
export async function personPurchases(personId: string): Promise<PersonPurchases> {
  const orders = readOr(await ordersOfPerson(personId), "[billing] a contact's orders", []);
  const bookings = readOr(await bookingsOfPerson(personId), "[billing] a contact's bookings", []);
  return { orders, bookings };
}
