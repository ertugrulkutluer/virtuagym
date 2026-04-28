import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MembersRepository } from "./members.repository";
import { MembersService } from "./members.service";

describe("MembersService", () => {
  let service: MembersService;

  const repo = {
    create: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    grantCreditsTx: jest.fn(),
    isUniqueViolation: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        MembersService,
        { provide: MembersRepository, useValue: repo },
      ],
    }).compile();
    service = mod.get(MembersService);
  });

  it("translates a Prisma unique-constraint error into ConflictException", async () => {
    const dbErr = new Error("duplicate");
    repo.create.mockRejectedValue(dbErr);
    repo.isUniqueViolation.mockReturnValue(true);

    await expect(
      service.create({ firstName: "A", lastName: "B", email: "a@b.c" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.isUniqueViolation).toHaveBeenCalledWith(dbErr);
  });

  it("rethrows non-unique repository errors as-is", async () => {
    const dbErr = new Error("connection lost");
    repo.create.mockRejectedValue(dbErr);
    repo.isUniqueViolation.mockReturnValue(false);

    await expect(
      service.create({ firstName: "A", lastName: "B", email: "a@b.c" }),
    ).rejects.toBe(dbErr);
  });

  it("fills pagination defaults when list query omits them", async () => {
    repo.list.mockResolvedValue([[{ id: "m1" }], 1]);
    const res = await service.list({});
    expect(res).toEqual({ items: [{ id: "m1" }], total: 1, take: 50, skip: 0 });
  });

  it("forwards explicit pagination values from the query", async () => {
    repo.list.mockResolvedValue([[], 0]);
    const res = await service.list({ take: 10, skip: 20 });
    expect(res.take).toBe(10);
    expect(res.skip).toBe(20);
  });

  it("get throws NotFound when the member is missing", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.get("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("getByUserId throws NotFound with a member-profile message", async () => {
    repo.findByUserId.mockResolvedValue(null);
    await expect(service.getByUserId("u1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("update verifies existence before delegating to the repository", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      service.update("missing", { firstName: "X" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("remove verifies existence before delegating to the repository", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.remove("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it("grantCredits requires the member to exist before granting", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      service.grantCredits("missing", { amount: 10 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.grantCreditsTx).not.toHaveBeenCalled();
  });

  it("grantCredits delegates to the transactional repo when member exists", async () => {
    repo.findById.mockResolvedValue({ id: "m1" });
    repo.grantCreditsTx.mockResolvedValue({
      pack: { id: "p1" },
      balance: 25,
    });
    const res = await service.grantCredits("m1", { amount: 10 });
    expect(repo.grantCreditsTx).toHaveBeenCalledWith("m1", { amount: 10 });
    expect(res.balance).toBe(25);
  });
});
