import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ClassesRepository } from "./classes.repository";
import { ClassesService } from "./classes.service";

describe("ClassesService", () => {
  let service: ClassesService;
  const repo = {
    create: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    softCancel: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        ClassesService,
        { provide: ClassesRepository, useValue: repo },
      ],
    }).compile();
    service = mod.get(ClassesService);
  });

  it("list fills pagination defaults when query omits take/skip", async () => {
    repo.list.mockResolvedValue([[{ id: "c1" }], 1]);
    const res = await service.list({});
    expect(res).toEqual({ items: [{ id: "c1" }], total: 1, take: 50, skip: 0 });
  });

  it("list passes explicit pagination through unchanged", async () => {
    repo.list.mockResolvedValue([[], 0]);
    const res = await service.list({ take: 5, skip: 10 });
    expect(res.take).toBe(5);
    expect(res.skip).toBe(10);
  });

  it("get throws NotFound when the class does not exist", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.get("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("update verifies the class exists before delegating", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      service.update("missing", { title: "x" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("update delegates to the repository when the class exists", async () => {
    repo.findById.mockResolvedValue({ id: "c1" });
    repo.update.mockResolvedValue({ id: "c1", title: "new" });
    const res = await service.update("c1", { title: "new" });
    expect(repo.update).toHaveBeenCalledWith("c1", { title: "new" });
    expect(res.title).toBe("new");
  });

  it("remove soft-cancels and returns a cancelled marker", async () => {
    repo.findById.mockResolvedValue({ id: "c1" });
    repo.softCancel.mockResolvedValue({ id: "c1", cancelled: true });
    const res = await service.remove("c1");
    expect(repo.softCancel).toHaveBeenCalledWith("c1");
    expect(res).toEqual({ id: "c1", cancelled: true });
  });

  it("remove throws NotFound when the class does not exist", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.remove("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.softCancel).not.toHaveBeenCalled();
  });
});
