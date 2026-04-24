import { db, usersTable, citiesTable, serviceTypesTable, mastersTable, leadsTable, ordersTable, transactionsTable } from "@workspace/db";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  // Create admin user
  const adminHash = await bcrypt.hash("admin123", 10);
  const leadOpHash = await bcrypt.hash("operator123", 10);
  const masterOpHash = await bcrypt.hash("master123", 10);

  await db.insert(usersTable).values([
    { login: "admin", passwordHash: adminHash, name: "Администратор", role: "admin" },
    { login: "operator1", passwordHash: leadOpHash, name: "Иван Петров", role: "lead_operator" },
    { login: "master_op", passwordHash: masterOpHash, name: "Сергей Козлов", role: "master_operator" },
  ]).onConflictDoNothing();

  // Cities
  await db.insert(citiesTable).values([
    { name: "Москва" },
    { name: "Санкт-Петербург" },
    { name: "Екатеринбург" },
    { name: "Новосибирск" },
    { name: "Краснодар" },
  ]).onConflictDoNothing();

  // Services
  await db.insert(serviceTypesTable).values([
    { name: "Укладка плитки" },
    { name: "Поклейка обоев" },
    { name: "Покраска стен" },
    { name: "Монтаж ламината" },
    { name: "Штукатурка стен" },
    { name: "Электромонтаж" },
    { name: "Сантехника" },
    { name: "Натяжные потолки" },
    { name: "Комплексный ремонт" },
  ]).onConflictDoNothing();

  // Masters
  const masterResults = await db.insert(mastersTable).values([
    { alias: "Мастер-001", city: "Москва", specialization: "Укладка плитки", rating: "4.8", totalOrders: 45, acceptedOrders: 42, debt: "5000" },
    { alias: "Мастер-002", city: "Москва", specialization: "Поклейка обоев, Покраска", rating: "4.2", totalOrders: 28, acceptedOrders: 25, debt: "0" },
    { alias: "Мастер-003", city: "Санкт-Петербург", specialization: "Монтаж ламината", rating: "3.9", totalOrders: 15, acceptedOrders: 12, debt: "10000" },
    { alias: "Мастер-004", city: "Екатеринбург", specialization: "Электромонтаж", rating: "4.6", totalOrders: 33, acceptedOrders: 31, debt: "0" },
    { alias: "Мастер-005", city: "Краснодар", specialization: "Сантехника", rating: "2.1", status: "suspended", totalOrders: 8, acceptedOrders: 4, debt: "15000" },
  ]).returning().onConflictDoNothing();

  // Leads
  const leadResults = await db.insert(leadsTable).values([
    { clientName: "Алексей Сидоров", clientPhone: "+7 (999) 123-45-67", city: "Москва", district: "Центральный", serviceType: "Укладка плитки", area: "45", source: "Сайт", status: "new" },
    { clientName: "Мария Иванова", clientPhone: "+7 (985) 234-56-78", city: "Москва", district: "Северный", serviceType: "Поклейка обоев", area: "62", comment: "Срочно", source: "Авито", status: "processing" },
    { clientName: "Дмитрий Кузнецов", clientPhone: "+7 (916) 345-67-89", city: "Санкт-Петербург", district: "Невский", serviceType: "Монтаж ламината", area: "78", source: "Телефон", status: "sent_to_work" },
    { clientName: "Елена Смирнова", clientPhone: "+7 (926) 456-78-90", city: "Москва", district: "Южный", serviceType: "Покраска стен", area: "35", source: "Рекомендация", status: "client_refusal" },
    { clientName: "Андрей Попов", clientPhone: "+7 (903) 567-89-01", city: "Екатеринбург", district: "Октябрьский", serviceType: "Электромонтаж", area: "90", source: "Сайт", status: "new" },
    { clientName: "Наталья Волкова", clientPhone: "+7 (910) 678-90-12", city: "Москва", district: "Западный", serviceType: "Комплексный ремонт", area: "120", source: "Авито", status: "processing" },
  ]).returning().onConflictDoNothing();

  // Orders from sent_to_work leads
  if (leadResults.length > 0) {
    const sentLead = leadResults.find(l => l.status === "sent_to_work");
    if (sentLead && masterResults.length > 0) {
      const orderResult = await db.insert(ordersTable).values({
        leadId: sentLead.id,
        city: sentLead.city,
        district: sentLead.district,
        serviceType: sentLead.serviceType,
        area: sentLead.area,
        comment: sentLead.comment,
        status: "completed",
        masterId: masterResults[0].id,
        orderAmount: "75000",
        commission: "11250",
        clientRating: 5,
      }).returning().onConflictDoNothing();

      if (orderResult.length > 0) {
        await db.insert(transactionsTable).values({
          orderId: orderResult[0].id,
          masterId: masterResults[0].id,
          orderAmount: "75000",
          commission: "11250",
          paymentStatus: "pending",
        }).onConflictDoNothing();
      }
    }

    // Another completed order
    if (leadResults[0] && masterResults[1]) {
      const orderResult2 = await db.insert(ordersTable).values({
        leadId: leadResults[0].id,
        city: leadResults[0].city,
        district: leadResults[0].district,
        serviceType: leadResults[0].serviceType,
        area: leadResults[0].area,
        status: "master_assigned",
        masterId: masterResults[1].id,
        orderAmount: "35000",
        commission: "5000",
      }).returning().onConflictDoNothing();

      if (orderResult2.length > 0) {
        await db.insert(transactionsTable).values({
          orderId: orderResult2[0].id,
          masterId: masterResults[1].id,
          orderAmount: "35000",
          commission: "5000",
          paymentStatus: "paid",
          paidAt: new Date(),
        }).onConflictDoNothing();
      }
    }
  }

  console.log("✅ Seeding complete!");
  console.log("Login credentials:");
  console.log("  Admin: admin / admin123");
  console.log("  Lead Operator: operator1 / operator123");
  console.log("  Master Operator: master_op / master123");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
