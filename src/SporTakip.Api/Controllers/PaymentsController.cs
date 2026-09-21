using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PaymentsController(GymService gymService) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<PaymentDto>> AddPayment([FromBody] CreatePaymentDto dto, CancellationToken ct)
    {
        if (dto.Amount <= 0)
            return BadRequest("Ödeme tutarı sıfırdan büyük olmalıdır.");

        var payment = await gymService.AddPaymentAsync(dto, ct);
        return Ok(payment);
    }
}
