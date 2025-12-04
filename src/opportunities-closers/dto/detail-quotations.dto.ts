export interface DetalleCotizacionDto {
  datosDelPaciente: {
    nombreDelPaciente: string;
    numeroDeDocumento: string;
    tipoDePaciente: string;
    tipoDeContrato: string;
    idDeCotizacion: number;
    historiaClinica: string;
  };
  cantidadDePlanes: number;
  planes: Array<{
    [key: string]: {
      configuracionDelContrato: {
        montoDeCotizacion: number;
        descuento: number;
        montoDelContrato: number;
        fechaDelContrato: string;
        metodoDePago: string;
        detallesFinancieros: {
          fechaDeDetalle: string;
          montoDeCuotaDeMolde: number;
          cantidadDePagosUnicos: number;
        };
        beneficiosDelPlan: string[];
        esRecomendado: boolean;
      };
    };
  }>;
  link: string;
  planSeleccionado: number;
}
